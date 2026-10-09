-- Daily email reminders through EmailOctopus (ADR 0030).
--
-- Four separate responsibilities live in the private reminder_private schema:
--   1. preferences             - per-account intent, language, enrollment
--                                 provenance and the last observed vendor state;
--   2. sync_jobs               - versioned outbox of vendor contact work;
--   3. dispatches              - at most one attempted reminder per
--                                 destination and UTC date;
--   4. suppressed_destinations - vendor unsubscribe/bounce/complaint state that
--                                 overrides local intent.
-- Plus the frozen, owner-requested legacy cohort (cohorts/cohort_members).
--
-- Nothing here talks to EmailOctopus. Edge Functions perform every vendor
-- request and report outcomes back through the service-only RPCs below.
-- Nothing here writes or reads in a way that creates gameplay state: Daily
-- completion is read straight from ranked_private.daily_results.
--
-- Enrollment provenance is explicit and never fabricated:
--   'user_opt_in'                      - the account itself submitted the
--                                        optional reminder choice; consent
--                                        wording version and server time recorded;
--   'owner_requested_existing_friends' - the owner asked for the frozen set of
--                                        accounts existing at a cutoff to be
--                                        enrolled. No consent timestamp exists
--                                        for these rows and the schema forbids one.
--
-- auth.users email columns are only referenced from plpgsql bodies, which are
-- resolved at call time: other native test suites replay every migration
-- against a simulated auth.users(id) table.
begin;

create schema reminder_private;
revoke all on schema reminder_private from public, anon, authenticated, service_role;

-- Server "now". Production is exactly clock_timestamp(); a separate function
-- only so the native PostgreSQL suite can substitute a labelled test clock.
create function reminder_private.utc_now() returns timestamptz
language sql volatile set search_path = '' as $$ select clock_timestamp() $$;

-- Lookup normalization: trim and lowercase only. Plus tags and dots are kept,
-- since they can be meaningful to the receiving mail server.
create function reminder_private.normalize_email(value text) returns text
language sql immutable set search_path = '' as $$ select nullif(lower(btrim(value)),'') $$;

-- Hash used as the ledger/suppression key, so logs and the ledger never need
-- the raw address.
create function reminder_private.destination_key(value text) returns text
language sql immutable set search_path = '' as $$
 select encode(sha256(convert_to(reminder_private.normalize_email(value),'UTF8')),'hex')
$$;

-- The verified Auth address of an account, or null when the account has none,
-- is anonymous or soft-deleted. Never an address supplied by a browser.
create function reminder_private.verified_email(uid uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
declare value text;
begin
 select u.email into value from auth.users u
 where u.id=uid and u.email_confirmed_at is not null and coalesce(u.is_anonymous,false)=false and u.deleted_at is null;
 return reminder_private.normalize_email(value);
end $$;

-- Global settings. Delivery is OFF until an explicit, separately approved
-- rollout step turns it on.
create table reminder_private.settings (
  id boolean primary key default true check(id),
  dispatch_enabled boolean not null default false,
  -- Send window in UTC minutes after midnight, half-open [start,end).
  -- Default 16:00-20:00 UTC (13:00-17:00 in Argentina): a proposal, not an
  -- owner-selected optimum.
  window_start_minute integer not null default 960 check(window_start_minute between 0 and 1439),
  window_end_minute integer not null default 1200 check(window_end_minute between 1 and 1440),
  -- EmailOctopus requires at least 24 hours between automation starts for a
  -- contact; the margin absorbs clock skew between us and the vendor.
  min_gap_seconds integer not null default 86520 check(min_gap_seconds >= 86400),
  consent_versions text[] not null default array['daily-v1-20261009'],
  updated_at timestamptz not null default clock_timestamp(),
  check(window_end_minute > window_start_minute)
);
insert into reminder_private.settings default values;

create table reminder_private.preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null,
  language text not null check(language in ('es','en')),
  version integer not null check(version >= 1),
  source text not null check(source in ('user_opt_in','owner_requested_existing_friends')),
  consent_version text,
  consented_at timestamptz,
  cohort_id text,
  owner_enrolled_at timestamptz,
  -- Minimum address needed for synchronization; null once retired.
  email text check(email is null or email = reminder_private.normalize_email(email)),
  destination_key text check(destination_key ~ '^[0-9a-f]{64}$'),
  vendor_contact_id text check(vendor_contact_id ~ '^[A-Za-z0-9-]{1,64}$'),
  vendor_status text not null default 'none' check(vendor_status in ('none','pending','subscribed','unsubscribed')),
  vendor_observed_at timestamptz,
  suppressed_reason text check(suppressed_reason in ('unsubscribed','bounced','complained','address_changed')),
  suppressed_at timestamptz,
  -- Server time of the latest enrollment (explicit opt-in or owner import).
  -- Vendor events that happened before it cannot change the new enrollment.
  enrollment_requested_at timestamptz not null,
  updated_at timestamptz not null,
  check(source <> 'user_opt_in' or (consent_version is not null and consented_at is not null)),
  -- The owner-requested cohort never carries a user consent record.
  check(source <> 'owner_requested_existing_friends' or (cohort_id is not null and owner_enrolled_at is not null and consent_version is null and consented_at is null)),
  check(not enabled or (email is not null and destination_key is not null and suppressed_reason is null)),
  check((email is null) = (destination_key is null)),
  check((suppressed_reason is null) = (suppressed_at is null))
);
create unique index reminder_one_enabled_destination on reminder_private.preferences(destination_key) where enabled;
create index reminder_preferences_destination on reminder_private.preferences(destination_key);

create table reminder_private.suppressed_destinations (
  destination_key text primary key check(destination_key ~ '^[0-9a-f]{64}$'),
  reason text not null check(reason in ('unsubscribed','bounced','complained')),
  observed_at timestamptz not null
);

create table reminder_private.cohorts (
  id text primary key check(id ~ '^[a-z0-9-]{3,64}$'),
  source text not null unique check(source = 'owner_requested_existing_friends'),
  cutoff timestamptz not null,
  frozen_at timestamptz not null,
  member_count integer not null check(member_count >= 0),
  manifest_digest text not null check(manifest_digest ~ '^[0-9a-f]{64}$'),
  applied_at timestamptz,
  apply_summary jsonb,
  check(cutoff <= frozen_at),
  check((applied_at is null) = (apply_summary is null))
);

-- Frozen at freeze time; never extended. A deleted account leaves through the
-- cascade and can therefore never be imported.
create table reminder_private.cohort_members (
  cohort_id text not null references reminder_private.cohorts(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key(cohort_id,user_id)
);
create trigger immutable_cohort_member before update on reminder_private.cohort_members
for each row execute function ranked_private.immutable_result();

create table reminder_private.sync_jobs (
  id bigint generated always as identity primary key,
  -- No foreign key: cleanup work must survive the account's deletion.
  user_id uuid,
  -- subscribe/unsubscribe follow one preference version and go stale when a
  -- newer version exists; retire (old address) and delete (account deleted)
  -- never go stale.
  kind text not null check(kind in ('subscribe','unsubscribe','retire','delete')),
  preference_version integer,
  source text check(source in ('user_opt_in','owner_requested_existing_friends')),
  language text check(language in ('es','en')),
  email text check(email is null or email = reminder_private.normalize_email(email)),
  destination_key text not null check(destination_key ~ '^[0-9a-f]{64}$'),
  vendor_contact_id text,
  status text not null default 'queued' check(status in ('queued','leased','done','skipped','failed')),
  attempts integer not null default 0 check(attempts >= 0),
  lease_token uuid,
  lease_until timestamptz,
  available_at timestamptz not null,
  created_at timestamptz not null,
  completed_at timestamptz,
  outcome text check(outcome ~ '^[a-z_]{1,40}$'),
  check((kind in ('subscribe','unsubscribe')) = (preference_version is not null)),
  check(kind <> 'subscribe' or (source is not null and language is not null and (email is not null or status in ('done','skipped','failed')))),
  -- The address is kept only until the work finishes.
  check(status not in ('done','skipped','failed') or email is null),
  check((status = 'leased') = (lease_token is not null and lease_until is not null))
);
create index reminder_sync_ready on reminder_private.sync_jobs(available_at,id) where status in ('queued','leased');

create table reminder_private.dispatches (
  destination_key text not null check(destination_key ~ '^[0-9a-f]{64}$'),
  send_date date not null,
  user_id uuid,
  status text not null check(status in ('claimed','sending','accepted','skipped','failed','uncertain')),
  token uuid not null unique,
  claimed_at timestamptz not null,
  lease_until timestamptz not null,
  sending_at timestamptz,
  finished_at timestamptz,
  reason text check(reason ~ '^[a-z_]{1,40}$'),
  primary key(destination_key,send_date),
  check(status not in ('sending','accepted','uncertain') or sending_at is not null)
);
create index reminder_dispatch_destination on reminder_private.dispatches(destination_key,sending_at) where sending_at is not null;

create table reminder_private.vendor_events (
  id uuid primary key,
  type text not null,
  occurred_at timestamptz not null,
  received_at timestamptz not null,
  outcome text not null
);

create table reminder_private.receipts (
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  request_digest text not null,
  response jsonb not null,
  created_at timestamptz not null,
  primary key(user_id,request_id)
);

create table reminder_private.rate_limits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_start timestamptz not null,
  requests integer not null
);

do $$ declare t text; begin
  foreach t in array array['settings','preferences','suppressed_destinations','cohorts','cohort_members','sync_jobs','dispatches','vendor_events','receipts','rate_limits'] loop
    execute format('alter table reminder_private.%I enable row level security',t);
    execute format('revoke all on reminder_private.%I from public, anon, authenticated, service_role',t);
  end loop;
end $$;

-- Account deletion: the auth.users cascade removes the preference row (the
-- account is ineligible from that moment). Before it goes, queue vendor
-- cleanup with just enough to find the contact, and detach ledger rows.
create function reminder_private.preference_deleted() returns trigger
language plpgsql security definer set search_path = '' as $$
declare now_value timestamptz := reminder_private.utc_now();
begin
 if old.destination_key is not null then
   insert into reminder_private.sync_jobs(user_id,kind,email,destination_key,vendor_contact_id,available_at,created_at)
   values(null,'delete',old.email,old.destination_key,old.vendor_contact_id,now_value,now_value);
 end if;
 -- Outstanding versioned work for this account is now meaningless.
 update reminder_private.sync_jobs set status='skipped',outcome='account_deleted',email=null,lease_token=null,lease_until=null,completed_at=now_value
 where user_id=old.user_id and status in ('queued','leased') and kind in ('subscribe','unsubscribe');
 update reminder_private.sync_jobs set user_id=null where user_id=old.user_id;
 update reminder_private.dispatches set user_id=null where user_id=old.user_id;
 return old;
end $$;
create trigger reminder_preference_deleted before delete on reminder_private.preferences
for each row execute function reminder_private.preference_deleted();

create function reminder_private.delivery_status(p reminder_private.preferences) returns text
language sql stable set search_path = '' as $$
 select case
   when p.user_id is null then 'disabled'
   when p.suppressed_reason in ('bounced','complained') then 'suppressed'
   when not p.enabled then 'disabled'
   when p.vendor_status = 'subscribed' and not exists(
     select 1 from reminder_private.suppressed_destinations s where s.destination_key=p.destination_key) then 'enabled'
   else 'pending' end
$$;

create function reminder_private.projection(uid uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare p reminder_private.preferences%rowtype; email text := reminder_private.verified_email(uid);
begin
 select * into p from reminder_private.preferences where user_id=uid;
 if not found then
   return jsonb_build_object('preference',jsonb_build_object(
     'enabled',false,'language',null,'version',0,'source',null,'deliveryStatus','disabled','suppressedReason',null,
     'email',email,'emailAvailable',email is not null));
 end if;
 return jsonb_build_object('preference',jsonb_build_object(
   'enabled',p.enabled,'language',p.language,'version',p.version,'source',p.source,
   'deliveryStatus',reminder_private.delivery_status(p),'suppressedReason',p.suppressed_reason,
   'email',email,'emailAvailable',email is not null));
end $$;

-- Queue versioned contact work for the current preference row.
create function reminder_private.enqueue(p reminder_private.preferences, job_kind text) returns void
language plpgsql volatile set search_path = '' as $$
declare now_value timestamptz := reminder_private.utc_now();
begin
 insert into reminder_private.sync_jobs(user_id,kind,preference_version,source,language,email,destination_key,vendor_contact_id,available_at,created_at)
 values(p.user_id,job_kind,p.version,case when job_kind='subscribe' then p.source end,case when job_kind='subscribe' then p.language end,
   p.email,p.destination_key,p.vendor_contact_id,now_value,now_value);
end $$;

-- An enabled preference whose verified Auth address no longer matches the
-- enrolled one is switched off: the new address needs a fresh enrollment and
-- the old destination is retired at the vendor. Returns true on a change.
create function reminder_private.reconcile_address(uid uuid) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare p reminder_private.preferences%rowtype; now_value timestamptz := reminder_private.utc_now();
begin
 select * into p from reminder_private.preferences where user_id=uid for update;
 if not found or p.email is null or p.email is not distinct from reminder_private.verified_email(uid) then return false; end if;
 insert into reminder_private.sync_jobs(user_id,kind,email,destination_key,vendor_contact_id,available_at,created_at)
 values(uid,'retire',p.email,p.destination_key,p.vendor_contact_id,now_value,now_value);
 update reminder_private.preferences set enabled=false,email=null,destination_key=null,vendor_contact_id=null,vendor_status='none',
   suppressed_reason=case when p.suppressed_reason in ('bounced','complained') then p.suppressed_reason else 'address_changed' end,
   suppressed_at=case when p.suppressed_reason in ('bounced','complained') then p.suppressed_at else now_value end,
   version=version+1,updated_at=now_value where user_id=uid;
 return true;
end $$;

-- Browser-facing preference RPC. The Edge Function passes only its verified
-- Auth user; no address, user ID, vendor ID, timestamp or status is accepted.
create function public.email_preferences(verified_user_id uuid, request jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
 uid uuid := verified_user_id;
 act text := request->>'action';
 allowed text[]; n integer; now_value timestamptz; k uuid; digest text;
 cached reminder_private.receipts%rowtype; p reminder_private.preferences%rowtype; found_row boolean;
 want boolean; lang text; consent text; email text; dkey text; result jsonb; s reminder_private.settings%rowtype;
begin
 if request is null or jsonb_typeof(request) <> 'object' or act is null then raise exception 'INVALID_REQUEST'; end if;
 allowed := case act when 'get' then array['action']
   when 'set' then array['action','enabled','language','consentVersion','expectedVersion','requestId'] else null end;
 if allowed is null or exists(select 1 from jsonb_object_keys(request) key where not key=any(allowed)) then raise exception 'INVALID_REQUEST'; end if;
 if uid is null or not exists(select 1 from auth.users where id=uid) then raise exception 'UNAUTHORIZED'; end if;
 now_value:=clock_timestamp();
 insert into reminder_private.rate_limits values(uid,now_value,1)
 on conflict(user_id) do update set
   requests=case when reminder_private.rate_limits.window_start <= now_value-interval '1 minute' then 1 else reminder_private.rate_limits.requests+1 end,
   window_start=case when reminder_private.rate_limits.window_start <= now_value-interval '1 minute' then now_value else reminder_private.rate_limits.window_start end
 returning requests into n;
 if n>30 then return jsonb_build_object('error',jsonb_build_object('code','RATE_LIMITED','message','Too many requests; retry in a minute.')); end if;
 begin
 perform reminder_private.reconcile_address(uid);
 if act='get' then return reminder_private.projection(uid); end if;

 -- set: strict types, enums and the consent version on every enable.
 if jsonb_typeof(request->'enabled') is distinct from 'boolean'
   or jsonb_typeof(request->'expectedVersion') is distinct from 'number' or request->>'expectedVersion' !~ '^[0-9]{1,9}$'
   or jsonb_typeof(request->'requestId') is distinct from 'string'
   or request->>'requestId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'INVALID_REQUEST'; end if;
 want:=(request->>'enabled')::boolean;
 select * into s from reminder_private.settings;
 if want then
   if not (request ? 'language' and request ? 'consentVersion') or jsonb_typeof(request->'language') is distinct from 'string'
     or request->>'language' not in ('es','en') or jsonb_typeof(request->'consentVersion') is distinct from 'string'
     or not (request->>'consentVersion' = any(s.consent_versions)) then raise exception 'INVALID_REQUEST'; end if;
 elsif request ? 'language' or request ? 'consentVersion' then raise exception 'INVALID_REQUEST';
 end if;
 lang:=request->>'language'; consent:=request->>'consentVersion';
 k:=(request->>'requestId')::uuid;
 digest:=encode(sha256(convert_to((request-'requestId')::text,'UTF8')),'hex');
 select * into cached from reminder_private.receipts where user_id=uid and request_id=k;
 if found then
   if cached.request_digest<>digest then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
   return cached.response;
 end if;
 select * into p from reminder_private.preferences where user_id=uid for update;
 found_row:=found;
 if coalesce(p.version,0)<>(request->>'expectedVersion')::integer then raise exception 'VERSION_CONFLICT'; end if;
 now_value:=reminder_private.utc_now();
 if want then
   email:=reminder_private.verified_email(uid);
   if email is null then raise exception 'EMAIL_UNAVAILABLE'; end if;
   dkey:=reminder_private.destination_key(email);
   -- Bounce/complaint suppression is never cleared from the account.
   if p.suppressed_reason in ('bounced','complained')
     or exists(select 1 from reminder_private.suppressed_destinations where destination_key=dkey and reason in ('bounced','complained')) then
     raise exception 'REMINDERS_SUPPRESSED';
   end if;
   if exists(select 1 from reminder_private.preferences where destination_key=dkey and enabled and user_id<>uid) then raise exception 'DESTINATION_IN_USE'; end if;
   if found_row and p.enabled and p.language=lang and p.destination_key=dkey and p.source='user_opt_in' then
     result:=reminder_private.projection(uid);  -- nothing to change
   else
     if found_row and p.destination_key is not null and p.destination_key<>dkey then
       insert into reminder_private.sync_jobs(user_id,kind,email,destination_key,vendor_contact_id,available_at,created_at)
       values(uid,'retire',p.email,p.destination_key,p.vendor_contact_id,now_value,now_value);
     end if;
     insert into reminder_private.preferences as x(user_id,enabled,language,version,source,consent_version,consented_at,cohort_id,owner_enrolled_at,
       email,destination_key,vendor_contact_id,vendor_status,vendor_observed_at,suppressed_reason,suppressed_at,enrollment_requested_at,updated_at)
     values(uid,true,lang,1,'user_opt_in',consent,now_value,null,null,email,dkey,null,'none',null,null,null,now_value,now_value)
     on conflict(user_id) do update set enabled=true,language=lang,version=x.version+1,source='user_opt_in',consent_version=consent,consented_at=now_value,
       cohort_id=null,owner_enrolled_at=null,email=excluded.email,destination_key=excluded.destination_key,
       vendor_contact_id=case when x.destination_key=excluded.destination_key then x.vendor_contact_id end,
       vendor_status=case when x.destination_key=excluded.destination_key then x.vendor_status else 'none' end,
       vendor_observed_at=case when x.destination_key=excluded.destination_key then x.vendor_observed_at end,
       suppressed_reason=null,suppressed_at=null,
       -- Re-enabling after a voluntary unsubscribe is a NEW explicit enrollment.
       enrollment_requested_at=case when x.enabled and x.destination_key=excluded.destination_key then x.enrollment_requested_at else now_value end,
       updated_at=now_value
     returning * into p;
     perform reminder_private.enqueue(p,'subscribe');
     result:=reminder_private.projection(uid);
   end if;
 else
   if not found_row or not p.enabled then
     result:=reminder_private.projection(uid);
   else
     update reminder_private.preferences set enabled=false,version=version+1,updated_at=now_value where user_id=uid returning * into p;
     perform reminder_private.enqueue(p,'unsubscribe');
     result:=reminder_private.projection(uid);
   end if;
 end if;
 insert into reminder_private.receipts values(uid,k,digest,result,now_value);
 return result;
 exception
   when raise_exception then return jsonb_build_object('error',jsonb_build_object('code',sqlerrm,'message',sqlerrm));
   when invalid_text_representation or numeric_value_out_of_range or check_violation then return jsonb_build_object('error',jsonb_build_object('code','INVALID_REQUEST','message','Invalid request.'));
   when unique_violation then return jsonb_build_object('error',jsonb_build_object('code','DESTINATION_IN_USE','message','DESTINATION_IN_USE'));
 end;
end $$;

-- Dispatch eligibility. Read-only: never creates a Daily round, never calls
-- ranked_game. reason is null for an eligible account. Every condition is
-- re-evaluated at startDispatch, close to the vendor call.
create function reminder_private.candidates(now_value timestamptz)
returns table(user_id uuid, destination_key text, contact_id text, language text, reason text)
language plpgsql stable security definer set search_path = '' as $$
declare
 today date := (now_value at time zone 'utc')::date;
 s reminder_private.settings%rowtype;
begin
 select * into s from reminder_private.settings;
 return query
 select p.user_id,p.destination_key,p.vendor_contact_id,p.language,
   case
     when not p.enabled then 'disabled'
     when p.suppressed_reason is not null then 'suppressed'
     when sd.reason is not null then 'destination_suppressed'
     when u.id is null or reminder_private.verified_email(p.user_id) is distinct from p.email then 'email_changed'
     when p.vendor_status <> 'subscribed' then 'vendor_not_subscribed'
     when p.vendor_contact_id is null then 'no_contact'
     when (select count(distinct r.round_index) from ranked_private.daily_results r where r.user_id=p.user_id and r.date=today) >= 3 then 'daily_complete'
     when exists(select 1 from reminder_private.dispatches d where d.destination_key=p.destination_key and d.send_date=today) then 'already_dispatched_today'
     when exists(select 1 from reminder_private.dispatches d where d.destination_key=p.destination_key and d.status in ('sending','accepted','uncertain')
       and d.sending_at > now_value - make_interval(secs => s.min_gap_seconds)) then 'min_gap'
     else null end
 from reminder_private.preferences p
 left join auth.users u on u.id=p.user_id
 left join reminder_private.suppressed_destinations sd on sd.destination_key=p.destination_key
 where p.destination_key is not null;
end $$;

create function reminder_private.in_window(now_value timestamptz) returns boolean
language sql stable set search_path = '' as $$
 select ((extract(hour from now_value at time zone 'utc')*60 + extract(minute from now_value at time zone 'utc'))::integer)
   between s.window_start_minute and s.window_end_minute-1
 from reminder_private.settings s
$$;

-- Apply a suppression-direction or confirmation observation from the vendor
-- (webhook or periodic read). Old observations never restore delivery.
create function reminder_private.observe(dkey text, contact text, status text, occurred timestamptz) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare p reminder_private.preferences%rowtype; now_value timestamptz := reminder_private.utc_now(); outcome text := 'ignored';
begin
 if status in ('bounced','complained') then
   insert into reminder_private.suppressed_destinations values(dkey,status,occurred)
   on conflict(destination_key) do update set reason=case when reminder_private.suppressed_destinations.reason in ('bounced','complained')
     then reminder_private.suppressed_destinations.reason else excluded.reason end,
     observed_at=greatest(reminder_private.suppressed_destinations.observed_at,excluded.observed_at);
   -- Hard suppression applies regardless of event order.
   for p in select * from reminder_private.preferences where destination_key=dkey or (contact is not null and vendor_contact_id=contact) for update loop
     update reminder_private.preferences set enabled=false,suppressed_reason=status,suppressed_at=now_value,
       version=version+case when enabled or suppressed_reason is distinct from status then 1 else 0 end,updated_at=now_value where user_id=p.user_id;
   end loop;
   return 'suppressed';
 end if;
 if status='unsubscribed' then
   for p in select * from reminder_private.preferences where destination_key=dkey or (contact is not null and vendor_contact_id=contact) for update loop
     -- An unsubscribe that happened before the latest explicit enrollment
     -- belongs to the previous enrollment.
     if occurred >= p.enrollment_requested_at then
       update reminder_private.preferences set vendor_status='unsubscribed',vendor_observed_at=occurred,
         enabled=false,suppressed_reason=coalesce(suppressed_reason,'unsubscribed'),suppressed_at=coalesce(suppressed_at,now_value),
         version=version+case when enabled then 1 else 0 end,updated_at=now_value where user_id=p.user_id;
       outcome:='suppressed';
     end if;
   end loop;
   if not exists(select 1 from reminder_private.preferences where destination_key=dkey and enrollment_requested_at > occurred) then
     insert into reminder_private.suppressed_destinations values(dkey,'unsubscribed',occurred)
     on conflict(destination_key) do update set observed_at=greatest(reminder_private.suppressed_destinations.observed_at,excluded.observed_at);
     outcome:='suppressed';
   end if;
   return outcome;
 end if;
 if status in ('subscribed','pending') then
   for p in select * from reminder_private.preferences where destination_key=dkey or (contact is not null and vendor_contact_id=contact) for update loop
     if p.enabled and occurred >= p.enrollment_requested_at and occurred >= coalesce(p.vendor_observed_at,'-infinity')
       and not (p.vendor_status='subscribed' and status='pending') then
       update reminder_private.preferences set vendor_status=status,vendor_observed_at=occurred,
         vendor_contact_id=coalesce(contact,vendor_contact_id),updated_at=now_value where user_id=p.user_id;
       if status='subscribed' then
         delete from reminder_private.suppressed_destinations where destination_key=dkey and reason='unsubscribed' and observed_at <= occurred;
       end if;
       outcome:='applied';
     end if;
   end loop;
   return outcome;
 end if;
 if status='deleted' then
   for p in select * from reminder_private.preferences where destination_key=dkey or (contact is not null and vendor_contact_id=contact) for update loop
     if occurred >= coalesce(p.vendor_observed_at,'-infinity') then
       -- Not recreated automatically: a vendor-side deletion may be a privacy request.
       update reminder_private.preferences set vendor_status='none',vendor_contact_id=null,vendor_observed_at=occurred,updated_at=now_value where user_id=p.user_id;
       outcome:='applied';
     end if;
   end loop;
   return outcome;
 end if;
 return outcome;
end $$;

-- Server worker RPC (EmailOctopus sync, webhooks, dispatch). Service-only.
create function public.email_reminders_worker(request jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
 act text := request->>'action';
 now_value timestamptz := reminder_private.utc_now();
 today date := (reminder_private.utc_now() at time zone 'utc')::date;
 s reminder_private.settings%rowtype; j reminder_private.sync_jobs%rowtype; p reminder_private.preferences%rowtype;
 d reminder_private.dispatches%rowtype; c record; items jsonb := '[]'::jsonb; lim integer; lease integer;
 e jsonb; result_code text; vstatus text; n integer := 0; uid uuid;
begin
 if request is null or jsonb_typeof(request) <> 'object' or act is null then raise exception 'INVALID_REQUEST'; end if;
 select * into s from reminder_private.settings;
 lim:=least(greatest(coalesce((request->>'limit')::integer,25),1),100);
 lease:=least(greatest(coalesce((request->>'leaseSeconds')::integer,120),30),900);

 if act='claimSync' then
   for j in select * from reminder_private.sync_jobs
     where (status='queued' and available_at<=now_value) or (status='leased' and lease_until<now_value)
     order by available_at,id limit lim for update skip locked loop
     if j.attempts >= 8 then
       update reminder_private.sync_jobs set status='failed',outcome='attempts_exhausted',email=null,lease_token=null,lease_until=null,completed_at=now_value where id=j.id;
       continue;
     end if;
     if j.kind in ('subscribe','unsubscribe') then
       select * into p from reminder_private.preferences where user_id=j.user_id;
       if not found or p.version<>j.preference_version then
         update reminder_private.sync_jobs set status='skipped',outcome='stale',email=null,lease_token=null,lease_until=null,completed_at=now_value where id=j.id;
         continue;
       end if;
     end if;
     update reminder_private.sync_jobs set status='leased',attempts=attempts+1,lease_token=gen_random_uuid(),lease_until=now_value+make_interval(secs=>lease)
     where id=j.id returning * into j;
     items:=items||jsonb_build_array(jsonb_build_object('jobId',j.id,'leaseToken',j.lease_token,'kind',j.kind,'source',j.source,
       'language',j.language,'email',j.email,'destinationKey',j.destination_key,'contactId',j.vendor_contact_id,'attempt',j.attempts));
   end loop;
   return jsonb_build_object('jobs',items);
 end if;

 if act='completeSync' then
   select * into j from reminder_private.sync_jobs where id=(request->>'jobId')::bigint for update;
   if not found or j.status<>'leased' or j.lease_token is distinct from (request->>'leaseToken')::uuid then return jsonb_build_object('accepted',false); end if;
   result_code:=request->>'outcome';
   if result_code='retry' then
     update reminder_private.sync_jobs set status='queued',lease_token=null,lease_until=null,
       available_at=now_value+make_interval(secs=>least(3600,60*power(2,attempts)::integer)),outcome=coalesce(request->>'detail','retry') where id=j.id;
     return jsonb_build_object('accepted',true);
   end if;
   if result_code not in ('done','failed') then raise exception 'INVALID_REQUEST'; end if;
   update reminder_private.sync_jobs set status=result_code,email=null,lease_token=null,lease_until=null,completed_at=now_value,
     outcome=coalesce(request->>'detail',result_code) where id=j.id;
   vstatus:=request->>'vendorStatus';
   if result_code='done' and j.kind in ('subscribe','unsubscribe') and vstatus is not null then
     if vstatus not in ('none','pending','subscribed','unsubscribed') then raise exception 'INVALID_REQUEST'; end if;
     select * into p from reminder_private.preferences where user_id=j.user_id for update;
     -- Only the job for the current version may record vendor state.
     if found and p.version=j.preference_version then
       if j.kind='subscribe' and vstatus='unsubscribed' then
         -- The vendor holds an unsubscribe the sync must not override.
         update reminder_private.preferences set vendor_contact_id=coalesce(request->>'contactId',vendor_contact_id) where user_id=p.user_id;
         perform reminder_private.observe(p.destination_key,request->>'contactId','unsubscribed',now_value);
       else
         update reminder_private.preferences set vendor_status=vstatus,vendor_contact_id=coalesce(request->>'contactId',vendor_contact_id),
           vendor_observed_at=now_value,updated_at=now_value where user_id=p.user_id;
       end if;
     end if;
   end if;
   return jsonb_build_object('accepted',true);
 end if;

 if act='reconcileAddresses' then
   for uid in select user_id from reminder_private.preferences where email is not null order by user_id loop
     if reminder_private.reconcile_address(uid) then n:=n+1; end if;
   end loop;
   return jsonb_build_object('retired',n);
 end if;

 -- Periodic vendor read targets: subscribed/pending contacts, least recently observed first.
 if act='reconcileTargets' then
   select coalesce(jsonb_agg(jsonb_build_object('destinationKey',destination_key,'contactId',vendor_contact_id,'email',email)),'[]'::jsonb) into items
   from (select destination_key,vendor_contact_id,email from reminder_private.preferences
     where enabled and email is not null order by vendor_observed_at nulls first,user_id limit lim) x;
   return jsonb_build_object('contacts',items);
 end if;

 if act='observe' then
   -- One periodic vendor read, timestamped by the server at receipt.
   if request->>'status' not in ('pending','subscribed','unsubscribed','deleted') or request->>'destinationKey' !~ '^[0-9a-f]{64}$' then raise exception 'INVALID_REQUEST'; end if;
   return jsonb_build_object('outcome',reminder_private.observe(request->>'destinationKey',request->>'contactId',request->>'status',now_value));
 end if;

 if act='vendorEvents' then
   if jsonb_typeof(request->'events') is distinct from 'array' or jsonb_array_length(request->'events')>1000 then raise exception 'INVALID_REQUEST'; end if;
   for e in select value from jsonb_array_elements(request->'events') order by (value->>'occurredAt')::timestamptz loop
     if e->>'id' !~* '^[0-9a-f-]{36}$' or e->>'destinationKey' !~ '^[0-9a-f]{64}$' then raise exception 'INVALID_REQUEST'; end if;
     if exists(select 1 from reminder_private.vendor_events where id=(e->>'id')::uuid) then continue; end if;
     vstatus:=case e->>'type'
       when 'contact.bounced' then 'bounced' when 'contact.complained' then 'complained'
       when 'contact.unsubscribed' then 'unsubscribed' when 'contact.deleted' then 'deleted'
       when 'contact.created' then lower(e->>'status') when 'contact.updated' then lower(e->>'status') else null end;
     result_code:=case when vstatus in ('bounced','complained','unsubscribed','subscribed','pending','deleted')
       then reminder_private.observe(e->>'destinationKey',e->>'contactId',vstatus,(e->>'occurredAt')::timestamptz) else 'ignored' end;
     insert into reminder_private.vendor_events values((e->>'id')::uuid,e->>'type',(e->>'occurredAt')::timestamptz,now_value,result_code);
     n:=n+1;
   end loop;
   return jsonb_build_object('processed',n);
 end if;

 if act='previewDispatch' then
   select coalesce(jsonb_object_agg(x.why,x.cnt),'{}'::jsonb) into items from
     (select coalesce(y.reason,'eligible') why,count(*) cnt from reminder_private.candidates(now_value) y group by 1) x;
   return jsonb_build_object('date',today,'dispatchEnabled',s.dispatch_enabled,'inWindow',reminder_private.in_window(now_value),'counts',items);
 end if;

 if act='claimDispatch' then
   -- An unfinished claim never becomes eligible again for its date:
   -- claimed-but-not-sending expires as skipped (no vendor call was made);
   -- sending expires as uncertain (the vendor may have accepted it).
   update reminder_private.dispatches set status='skipped',reason='lease_expired',finished_at=now_value where status='claimed' and lease_until<now_value;
   update reminder_private.dispatches set status='uncertain',reason='lease_expired',finished_at=now_value where status='sending' and lease_until<now_value;
   if not s.dispatch_enabled then return jsonb_build_object('dispatchEnabled',false,'items','[]'::jsonb); end if;
   if not reminder_private.in_window(now_value) then return jsonb_build_object('dispatchEnabled',true,'inWindow',false,'items','[]'::jsonb); end if;
   for c in select * from reminder_private.candidates(now_value) x where x.reason is null order by x.destination_key limit lim loop
     insert into reminder_private.dispatches(destination_key,send_date,user_id,status,token,claimed_at,lease_until)
     values(c.destination_key,today,c.user_id,'claimed',gen_random_uuid(),now_value,now_value+make_interval(secs=>lease))
     on conflict do nothing returning * into d;
     if d.token is not null then items:=items||jsonb_build_array(jsonb_build_object('token',d.token)); end if;
   end loop;
   return jsonb_build_object('dispatchEnabled',true,'inWindow',true,'items',items);
 end if;

 if act='startDispatch' then
   select * into d from reminder_private.dispatches where token=(request->>'token')::uuid for update;
   if not found or d.status<>'claimed' or d.lease_until<now_value then return jsonb_build_object('send',false,'reason','not_claimed'); end if;
   if not s.dispatch_enabled or not reminder_private.in_window(now_value) or d.send_date<>today then
     update reminder_private.dispatches set status='skipped',reason='window_closed',finished_at=now_value where token=d.token;
     return jsonb_build_object('send',false,'reason','window_closed');
   end if;
   select * into c from reminder_private.candidates(now_value) x where x.user_id=d.user_id and x.destination_key=d.destination_key;
   if not found then
     update reminder_private.dispatches set status='skipped',reason='account_missing',finished_at=now_value where token=d.token;
     return jsonb_build_object('send',false,'reason','account_missing');
   end if;
   -- The ledger row itself makes already_dispatched_today true; ignore that one reason.
   if c.reason is not null and c.reason<>'already_dispatched_today' then
     update reminder_private.dispatches set status='skipped',reason=c.reason,finished_at=now_value where token=d.token;
     return jsonb_build_object('send',false,'reason',c.reason);
   end if;
   update reminder_private.dispatches set status='sending',sending_at=now_value,lease_until=now_value+make_interval(secs=>lease) where token=d.token;
   return jsonb_build_object('send',true,'contactId',c.contact_id,'language',c.language);
 end if;

 if act='finishDispatch' then
   select * into d from reminder_private.dispatches where token=(request->>'token')::uuid for update;
   result_code:=request->>'outcome';
   if result_code not in ('accepted','failed','uncertain') then raise exception 'INVALID_REQUEST'; end if;
   if not found then return jsonb_build_object('accepted',false); end if;
   if d.status=result_code then return jsonb_build_object('accepted',true); end if;
   -- A sending row that expired to uncertain may still learn its definite outcome.
   if d.status='sending' or (d.status='uncertain' and result_code<>'uncertain') then
     update reminder_private.dispatches set status=result_code,finished_at=now_value,
       reason=case when result_code='accepted' then null else coalesce(request->>'detail',result_code) end where token=d.token;
     return jsonb_build_object('accepted',true);
   end if;
   return jsonb_build_object('accepted',false);
 end if;

 raise exception 'INVALID_REQUEST';
end $$;

-- Owner/operator RPC: frozen legacy cohort and delivery settings. Service-only;
-- reached by scripts/email-reminders-cohort.mjs, never by a browser.
create function reminder_private.cohort_apply(cid text, dry boolean) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
 co reminder_private.cohorts%rowtype; m record; email text; dkey text; seen text[] := '{}';
 now_value timestamptz := reminder_private.utc_now(); counts jsonb := '{}'::jsonb; reason text;
 p reminder_private.preferences%rowtype; present integer;
begin
 select * into co from reminder_private.cohorts where id=cid for update;
 if not found then raise exception 'COHORT_NOT_FOUND'; end if;
 select count(*) into present from reminder_private.cohort_members where cohort_id=cid;
 counts:=jsonb_build_object('frozen',co.member_count,'deleted',co.member_count-present);
 for m in select cm.user_id from reminder_private.cohort_members cm join auth.users u on u.id=cm.user_id
   where cm.cohort_id=cid order by u.created_at,cm.user_id loop
   email:=reminder_private.verified_email(m.user_id); dkey:=reminder_private.destination_key(email);
   reason:=case
     when email is null then 'no_verified_email'
     when exists(select 1 from reminder_private.preferences x where x.user_id=m.user_id) then 'existing_preference'
     when exists(select 1 from reminder_private.suppressed_destinations x where x.destination_key=dkey) then 'destination_suppressed'
     when dkey=any(seen) or exists(select 1 from reminder_private.preferences x where x.destination_key=dkey) then 'duplicate_destination'
     else 'enroll' end;
   counts:=jsonb_set(counts,array[reason],to_jsonb(coalesce((counts->>reason)::integer,0)+1));
   if reason='enroll' then
     seen:=seen||dkey;
     if not dry then
       insert into reminder_private.preferences(user_id,enabled,language,version,source,cohort_id,owner_enrolled_at,email,destination_key,
         vendor_status,enrollment_requested_at,updated_at)
       -- Missing language defaults to Spanish for this cohort; editable in Account.
       values(m.user_id,true,'es',1,'owner_requested_existing_friends',cid,now_value,email,dkey,'none',now_value,now_value)
       returning * into p;
       perform reminder_private.enqueue(p,'subscribe');
     end if;
   end if;
 end loop;
 return counts;
end $$;

create function public.email_reminders_admin(request jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
 act text := request->>'action'; cid text := request->>'cohortId'; co reminder_private.cohorts%rowtype;
 now_value timestamptz := reminder_private.utc_now(); cut timestamptz; digest text; n integer; summary jsonb;
 s reminder_private.settings%rowtype;
begin
 if request is null or jsonb_typeof(request) <> 'object' or act is null then raise exception 'INVALID_REQUEST'; end if;
 if act in ('freezeCohort','previewCohort','applyCohort') and (cid is null or cid !~ '^[a-z0-9-]{3,64}$') then raise exception 'INVALID_REQUEST'; end if;

 if act='freezeCohort' then
   cut:=(request->>'cutoff')::timestamptz;
   if cut is null or cut>now_value then raise exception 'INVALID_CUTOFF'; end if;
   select * into co from reminder_private.cohorts where id=cid;
   if found then
     if co.cutoff<>cut then raise exception 'COHORT_CONFLICT'; end if;
   else
     if exists(select 1 from reminder_private.cohorts where source='owner_requested_existing_friends') then raise exception 'COHORT_CONFLICT'; end if;
     insert into reminder_private.cohorts(id,source,cutoff,frozen_at,member_count,manifest_digest)
     values(cid,'owner_requested_existing_friends',cut,now_value,0,repeat('0',64));
     execute 'insert into reminder_private.cohort_members(cohort_id,user_id)
       select $1,u.id from auth.users u where u.created_at <= $2 and coalesce(u.is_anonymous,false)=false and u.deleted_at is null'
     using cid,cut;
     select count(*),encode(sha256(convert_to(coalesce(string_agg(user_id::text,',' order by user_id),''),'UTF8')),'hex') into n,digest
     from reminder_private.cohort_members where cohort_id=cid;
     update reminder_private.cohorts set member_count=n,manifest_digest=digest where id=cid returning * into co;
   end if;
   return jsonb_build_object('cohortId',co.id,'cutoff',co.cutoff,'frozenAt',co.frozen_at,'members',co.member_count,
     'manifestDigest',co.manifest_digest,'applied',co.applied_at is not null,'preview',reminder_private.cohort_apply(cid,true));
 end if;

 if act='previewCohort' then
   select * into co from reminder_private.cohorts where id=cid;
   if not found then raise exception 'COHORT_NOT_FOUND'; end if;
   return jsonb_build_object('cohortId',co.id,'cutoff',co.cutoff,'members',co.member_count,'manifestDigest',co.manifest_digest,
     'applied',co.applied_at is not null,'appliedSummary',co.apply_summary,'preview',reminder_private.cohort_apply(cid,true));
 end if;

 if act='applyCohort' then
   select * into co from reminder_private.cohorts where id=cid for update;
   if not found then raise exception 'COHORT_NOT_FOUND'; end if;
   if request->>'manifestDigest' is distinct from co.manifest_digest then raise exception 'MANIFEST_MISMATCH'; end if;
   -- One-time: a rerun reports the original outcome and writes nothing.
   if co.applied_at is not null then
     return jsonb_build_object('cohortId',co.id,'applied',true,'appliedAt',co.applied_at,'summary',co.apply_summary,'rerun',true);
   end if;
   summary:=reminder_private.cohort_apply(cid,false);
   update reminder_private.cohorts set applied_at=now_value,apply_summary=summary where id=cid;
   return jsonb_build_object('cohortId',cid,'applied',true,'appliedAt',now_value,'summary',summary,'rerun',false);
 end if;

 if act='getSettings' then
   select * into s from reminder_private.settings;
   return jsonb_build_object('dispatchEnabled',s.dispatch_enabled,'windowStartMinute',s.window_start_minute,
     'windowEndMinute',s.window_end_minute,'minGapSeconds',s.min_gap_seconds,'consentVersions',to_jsonb(s.consent_versions));
 end if;

 if act='setDispatch' then
   -- Activation is a separate, explicitly approved release step.
   if jsonb_typeof(request->'enabled') is distinct from 'boolean' or (request->>'enabled')::boolean and request->>'confirmation' is distinct from 'ENABLE_DAILY_REMINDERS' then
     raise exception 'INVALID_REQUEST';
   end if;
   update reminder_private.settings set dispatch_enabled=(request->>'enabled')::boolean,updated_at=now_value;
   return jsonb_build_object('dispatchEnabled',(request->>'enabled')::boolean);
 end if;

 raise exception 'INVALID_REQUEST';
end $$;

revoke all on all functions in schema reminder_private from public, anon, authenticated, service_role;
revoke all on function public.email_preferences(uuid,jsonb) from public, anon, authenticated;
grant execute on function public.email_preferences(uuid,jsonb) to service_role;
revoke all on function public.email_reminders_worker(jsonb) from public, anon, authenticated;
grant execute on function public.email_reminders_worker(jsonb) to service_role;
revoke all on function public.email_reminders_admin(jsonb) from public, anon, authenticated;
grant execute on function public.email_reminders_admin(jsonb) to service_role;

commit;
