-- Private Daily leagues (ADR 0026, spec 2026-10-08-private-daily-leagues).
--
-- Friends leagues rank members on the EXISTING server-verified
-- ranked_private.daily_results. Nothing here writes a scoring result, round,
-- streak or ranked receipt: live standings are derived on read, and each
-- completed UTC week (Monday 00:00 UTC) is frozen once into immutable
-- week/entry rows that carry trophies.
--
-- Eligibility: a Daily result counts in a league only when its server
-- finished_at falls inside one of that member's half-open membership
-- intervals [joined_at, left_at). The period (Today / This week) is chosen
-- by the result's challenge date. New members therefore start at zero: no
-- global total, no earlier result - not even from the joining day - carries
-- in, and nothing backfills while absent.
--
-- Lock order (every path acquires in this order, never the reverse):
--   1. the acting account's ranked_private.accounts row (FOR UPDATE);
--      ranked_game's Daily writes take the same lock first;
--   2. friend_leagues rows (FOR UPDATE), ascending id when several;
--   3. the week cutoff advisory lock (class 20261008, key = week number):
--      exclusive for finalization, shared for Daily writes.
-- Daily writes never lock a league, so a finalizer waiting for in-flight
-- Daily writers on (3) cannot form a cycle with them.
begin;

-- Server "now" for leagues and the Daily cutoff barrier. Production is
-- exactly clock_timestamp(); it is a separate function only so the native
-- PostgreSQL test suite can substitute a clearly labelled simulated clock.
create function ranked_private.utc_now() returns timestamptz
language sql volatile set search_path = '' as $$ select clock_timestamp() $$;

create function ranked_private.week_start(d date) returns date
language sql immutable set search_path = '' as $$ select d - (extract(isodow from d)::integer - 1) $$;

create function ranked_private.week_lock_key(week_start date) returns integer
language sql immutable set search_path = '' as $$ select (week_start - date '2000-01-03')::integer / 7 $$;

create table ranked_private.friend_leagues (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references ranked_private.accounts(user_id) on delete cascade,
  name text not null check(char_length(name) between 3 and 40 and name = btrim(name) and name !~ '[[:cntrl:]]' and name !~ '^[[:space:]]|[[:space:]]$'),
  created_at timestamptz not null,
  version integer not null default 0 check(version >= 0),
  -- week_start of the newest finalized week; null until the first one closes.
  finalized_through date check(finalized_through is null or extract(isodow from finalized_through) = 1)
);
create index friend_leagues_owner on ranked_private.friend_leagues(owner_id);

create table ranked_private.friend_league_members (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references ranked_private.friend_leagues(id) on delete cascade,
  -- Cleared (with state 'deleted') when the account is deleted, so archived
  -- winners keep an anonymous identity instead of cascading away.
  user_id uuid references ranked_private.accounts(user_id) on delete set null,
  state text not null check(state in ('active','left','removed','deleted')),
  state_changed_at timestamptz not null,
  unique(league_id,user_id),
  check((state = 'deleted') = (user_id is null))
);
create index friend_league_members_user on ranked_private.friend_league_members(user_id) where state = 'active';
create index friend_league_members_league on ranked_private.friend_league_members(league_id,state);

create table ranked_private.friend_league_member_intervals (
  member_id uuid not null references ranked_private.friend_league_members(id) on delete cascade,
  joined_at timestamptz not null,
  left_at timestamptz,
  primary key(member_id,joined_at),
  check(left_at is null or left_at >= joined_at)
);
create unique index friend_league_one_open_interval on ranked_private.friend_league_member_intervals(member_id) where left_at is null;

create table ranked_private.friend_league_invites (
  league_id uuid primary key references ranked_private.friend_leagues(id) on delete cascade,
  token text not null unique check(token ~ '^[A-Za-z0-9_-]{43,128}$'),
  rotated_at timestamptz not null
);

create table ranked_private.friend_league_weeks (
  league_id uuid not null references ranked_private.friend_leagues(id) on delete cascade,
  week_start date not null check(extract(isodow from week_start) = 1),
  starts_on date not null,
  ends_on date not null,
  finalized_at timestamptz not null,
  participants integer not null check(participants >= 0),
  winning_points integer check(winning_points >= 0),
  primary key(league_id,week_start),
  check(ends_on = week_start + 6 and starts_on between week_start and ends_on),
  check((participants = 0) = (winning_points is null))
);

create table ranked_private.friend_league_week_entries (
  league_id uuid not null,
  week_start date not null,
  member_id uuid not null references ranked_private.friend_league_members(id) on delete cascade,
  points integer not null check(points between 0 and 2100),
  results integer not null check(results between 1 and 21),
  completed_days integer not null check(completed_days between 0 and 7),
  rank integer not null check(rank >= 1),
  winner boolean not null,
  primary key(league_id,week_start,member_id),
  foreign key(league_id,week_start) references ranked_private.friend_league_weeks(league_id,week_start) on delete cascade,
  check(winner = (rank = 1))
);
create index friend_league_week_entries_winner on ranked_private.friend_league_week_entries(member_id) where winner;

-- Finalized history is immutable; deletion only via league deletion cascade.
create trigger immutable_friend_league_week before update on ranked_private.friend_league_weeks
for each row execute function ranked_private.immutable_result();
create trigger immutable_friend_league_week_entry before update on ranked_private.friend_league_week_entries
for each row execute function ranked_private.immutable_result();

create table ranked_private.friend_league_receipts (
  user_id uuid not null references ranked_private.accounts(user_id) on delete cascade,
  key uuid not null,
  request_digest text not null,
  action text not null,
  league_id uuid,
  -- Minimal outcome only: never standings, member lists or invite tokens.
  response jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key(user_id,key)
);

create table ranked_private.friend_league_rate_limits (
  user_id uuid primary key references ranked_private.accounts(user_id) on delete cascade,
  window_start timestamptz not null,
  requests integer not null
);

do $$ declare t text; begin
  foreach t in array array['friend_leagues','friend_league_members','friend_league_member_intervals','friend_league_invites','friend_league_weeks','friend_league_week_entries','friend_league_receipts','friend_league_rate_limits'] loop
    execute format('alter table ranked_private.%I enable row level security',t);
    execute format('revoke all on ranked_private.%I from public, anon, authenticated, service_role',t);
  end loop;
end $$;

-- 48 bytes from three CSPRNG-backed v4 UUIDs (366 random bits >= 32 random
-- bytes), base64url without padding: 64 characters. No extension needed.
create function ranked_private.new_invite_token() returns text
language sql volatile set search_path = '' as $$
 select translate(encode(uuid_send(gen_random_uuid()) || uuid_send(gen_random_uuid()) || uuid_send(gen_random_uuid()),'base64'),'+/=','-_')
$$;

-- Eligible per-member totals for a date range: each result counted at most
-- once (EXISTS over non-overlapping intervals), by challenge date.
create function ranked_private.league_scores(lid uuid, from_date date, to_date date)
returns table(member_id uuid, points integer, results integer, completed_days integer)
language sql stable set search_path = '' as $$
 with elig as (
   select m.id member_id,r.date,r.points
   from ranked_private.friend_league_members m
   join ranked_private.daily_results r on r.user_id=m.user_id and r.date between from_date and to_date
   where m.league_id=lid and exists(
     select 1 from ranked_private.friend_league_member_intervals i
     where i.member_id=m.id and r.finished_at>=i.joined_at and (i.left_at is null or r.finished_at<i.left_at))
 ), per_day as (
   select member_id,date,count(*)::integer c,sum(points)::integer p from elig group by member_id,date
 )
 select member_id,sum(p)::integer,sum(c)::integer,(count(*) filter(where c=3))::integer from per_day group by member_id
$$;

-- Freeze every ended, unfinalized week of a league, oldest first, at most
-- max_weeks per call. Returns true when more ended weeks remain. Each week
-- first takes the EXCLUSIVE cutoff lock, which waits for every in-flight
-- Daily write of that week (they hold it SHARED); the following statements
-- then read with fresh READ COMMITTED snapshots that include those writes.
-- The league row lock serializes concurrent finalizers; the primary keys
-- make a duplicate award impossible regardless.
create function ranked_private.finalize_league(lid uuid, max_weeks integer) returns boolean
language plpgsql volatile set search_path = '' as $$
declare
 lg ranked_private.friend_leagues%rowtype;
 current_week date := ranked_private.week_start((ranked_private.utc_now() at time zone 'utc')::date);
 next_week date; created_on date; done integer := 0;
begin
 select * into lg from ranked_private.friend_leagues where id=lid;
 if not found then return false; end if;
 created_on := (lg.created_at at time zone 'utc')::date;
 next_week := coalesce(lg.finalized_through + 7, ranked_private.week_start(created_on));
 if next_week >= current_week then return false; end if;
 select * into lg from ranked_private.friend_leagues where id=lid for update;
 next_week := coalesce(lg.finalized_through + 7, ranked_private.week_start(created_on));
 while next_week < current_week and done < max_weeks loop
   perform pg_advisory_xact_lock(20261008, ranked_private.week_lock_key(next_week));
   insert into ranked_private.friend_league_weeks(league_id,week_start,starts_on,ends_on,finalized_at,participants,winning_points)
   select lid,next_week,greatest(next_week,created_on),next_week+6,ranked_private.utc_now(),count(*),max(s.points)
   from ranked_private.league_scores(lid,next_week,next_week+6) s;
   insert into ranked_private.friend_league_week_entries(league_id,week_start,member_id,points,results,completed_days,rank,winner)
   select lid,next_week,member_id,points,results,completed_days,rk,rk=1
   from (select s.*,rank() over(order by s.points desc)::integer rk from ranked_private.league_scores(lid,next_week,next_week+6) s) ranked;
   update ranked_private.friend_leagues set finalized_through=next_week where id=lid;
   next_week := next_week + 7; done := done + 1;
 end loop;
 return next_week < current_week;
end $$;

create function ranked_private.league_trophies(mid uuid) returns integer
language sql stable set search_path = '' as $$
 select count(*)::integer from ranked_private.friend_league_week_entries where member_id=mid and winner
$$;

create function ranked_private.league_standings(lid uuid, uid uuid, today date, period text, page_limit integer, page_offset integer, pending boolean) returns jsonb
language sql stable set search_path = '' as $$
 with lg as (select * from ranked_private.friend_leagues where id=lid),
 bounds as (
   select case when period='today' then today else greatest(ranked_private.week_start(today),(lg.created_at at time zone 'utc')::date) end from_date, today to_date from lg
 ),
 sc as (select s.* from bounds b cross join lateral ranked_private.league_scores(lid,b.from_date,b.to_date) s),
 base as (
   select m.id member_id,m.user_id,m.state,a.nickname,sc.points,sc.results,sc.completed_days,
     ranked_private.league_trophies(m.id) trophies,
     (select count(*)::integer from ranked_private.daily_results d where d.user_id=m.user_id and d.date=today) played_today,
     exists(select 1 from ranked_private.daily_rounds d where d.user_id=m.user_id and d.date=today) started_today
   from ranked_private.friend_league_members m
   left join ranked_private.accounts a on a.user_id=m.user_id
   left join sc on sc.member_id=m.id
   where m.league_id=lid and m.user_id is not null and (m.state='active' or sc.member_id is not null)
 ), ranked as (
   select b.*,
     case when results is not null then rank() over(partition by results is null order by points desc) end rk,
     row_number() over(order by results is null, points desc nulls last, lower(nickname), nickname, member_id) ord
   from base b
 ), entry as (
   select ord,user_id,jsonb_build_object(
     'memberId',member_id,'nickname',nickname,'former',state<>'active','me',user_id=uid,
     'rank',rk,'points',coalesce(points,0),'results',coalesce(results,0),'completedDays',coalesce(completed_days,0),
     'trophies',trophies,
     'played',case when period='today' then played_today end,
     'status',case
       when period<>'today' then case when results is null then 'notPlayed' else 'played' end
       when played_today=3 and results is null then 'finishedBeforeJoin'
       when played_today=3 then 'finished'
       when played_today>0 or started_today then 'inProgress'
       else 'notPlayed' end) e
   from ranked
 )
 select jsonb_build_object(
   'league',(select jsonb_build_object('id',lg.id,'name',lg.name,'owner',lg.owner_id=uid,
      'memberCount',(select count(*) from ranked_private.friend_league_members where league_id=lid and state='active'),
      'createdOn',(lg.created_at at time zone 'utc')::date) from lg),
   'period',period,
   'range',(select jsonb_build_object('from',from_date,'to',to_date,'today',today) from bounds),
   'entries',coalesce((select jsonb_agg(e order by ord) from (select * from entry order by ord limit page_limit offset page_offset) p),'[]'::jsonb),
   'own',(select e from entry where user_id=uid),
   'total',(select count(*) from entry),
   'offset',page_offset,
   'pending',pending)
$$;

create function ranked_private.league_member_json(mid uuid) returns jsonb
language sql stable set search_path = '' as $$
 select jsonb_build_object('memberId',m.id,'nickname',a.nickname,'deleted',m.state='deleted','former',m.state<>'active')
 from ranked_private.friend_league_members m left join ranked_private.accounts a on a.user_id=m.user_id where m.id=mid
$$;

create function ranked_private.league_history(lid uuid, page_limit integer, page_offset integer, pending boolean) returns jsonb
language sql stable set search_path = '' as $$
 select jsonb_build_object(
  'weeks',coalesce((select jsonb_agg(w order by week_start desc) from (
     select wk.week_start,jsonb_build_object('weekStart',wk.week_start,'startsOn',wk.starts_on,'endsOn',wk.ends_on,
       'participants',wk.participants,'winningPoints',wk.winning_points,
       'shared',(select count(*) from ranked_private.friend_league_week_entries e where e.league_id=lid and e.week_start=wk.week_start and e.winner)>1,
       'winners',coalesce((select jsonb_agg(ranked_private.league_member_json(e.member_id) order by e.member_id)
          from ranked_private.friend_league_week_entries e where e.league_id=lid and e.week_start=wk.week_start and e.winner),'[]'::jsonb)) w
     from ranked_private.friend_league_weeks wk where wk.league_id=lid
     order by wk.week_start desc limit page_limit offset page_offset) x),'[]'::jsonb),
  'total',(select count(*) from ranked_private.friend_league_weeks where league_id=lid),
  'offset',page_offset,
  'pending',pending)
$$;

create function ranked_private.league_member_wins(lid uuid, mid uuid, page_limit integer, page_offset integer, pending boolean) returns jsonb
language sql stable set search_path = '' as $$
 select jsonb_build_object(
  'member',ranked_private.league_member_json(mid),
  'weeks',coalesce((select jsonb_agg(w order by week_start desc) from (
     select wk.week_start,jsonb_build_object('weekStart',wk.week_start,'startsOn',wk.starts_on,'endsOn',wk.ends_on,'points',e.points,
       'shared',(select count(*) from ranked_private.friend_league_week_entries x where x.league_id=lid and x.week_start=wk.week_start and x.winner)>1) w
     from ranked_private.friend_league_week_entries e join ranked_private.friend_league_weeks wk on wk.league_id=e.league_id and wk.week_start=e.week_start
     where e.league_id=lid and e.member_id=mid and e.winner
     order by wk.week_start desc limit page_limit offset page_offset) x),'[]'::jsonb),
  'total',(select count(*) from ranked_private.friend_league_week_entries where league_id=lid and member_id=mid and winner),
  'offset',page_offset,
  'pending',pending)
$$;

create function ranked_private.league_manage(lid uuid) returns jsonb
language sql stable set search_path = '' as $$
 select jsonb_build_object(
  'league',jsonb_build_object('id',lg.id,'name',lg.name,'version',lg.version),
  'invite',(select jsonb_build_object('token',token) from ranked_private.friend_league_invites where league_id=lid),
  'members',coalesce((select jsonb_agg(jsonb_build_object('memberId',id,'nickname',nickname,'state',state,'owner',owner) order by owner desc,state,lower(nickname),id) from (
     (select m.id,a.nickname,m.state,m.user_id=lg.owner_id owner from ranked_private.friend_league_members m join ranked_private.accounts a on a.user_id=m.user_id
      where m.league_id=lid and m.state='active' order by lower(a.nickname) limit 50)
     union all
     (select m.id,a.nickname,m.state,false from ranked_private.friend_league_members m join ranked_private.accounts a on a.user_id=m.user_id
      where m.league_id=lid and m.state='removed' order by m.state_changed_at desc limit 50)) x),'[]'::jsonb),
  'limits',jsonb_build_object('members',50))
 from ranked_private.friend_leagues lg where lg.id=lid
$$;

-- Service-only entry point; the Edge Function passes its verified Auth user.
create function public.private_leagues(verified_user_id uuid, request jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
 uid uuid := verified_user_id;
 act text := request->>'action';
 allowed text[]; n integer; now_value timestamptz; today date;
 k uuid; digest text; cached ranked_private.friend_league_receipts%rowtype;
 lid uuid; mid uuid; lg ranked_private.friend_leagues%rowtype;
 me ranked_private.friend_league_members%rowtype; target ranked_private.friend_league_members%rowtype;
 lim integer; off integer; nm text; tok text; per text; result jsonb; pending boolean := false;
 prompted boolean; last_left timestamptz;
 uuid_pattern constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
begin
 if request is null or jsonb_typeof(request) <> 'object' or act is null then raise exception 'INVALID_REQUEST'; end if;
 allowed := case act
   when 'list' then array['action']
   when 'preview' then array['action','token']
   when 'standings' then array['action','leagueId','period','limit','offset']
   when 'history' then array['action','leagueId','limit','offset']
   when 'memberWins' then array['action','leagueId','memberId','limit','offset']
   when 'manage' then array['action','leagueId']
   when 'create' then array['action','name','idempotencyKey']
   when 'rename' then array['action','leagueId','name','expectedVersion','idempotencyKey']
   when 'join' then array['action','token','idempotencyKey']
   when 'leave' then array['action','leagueId','idempotencyKey']
   when 'remove' then array['action','leagueId','memberId','expectedVersion','idempotencyKey']
   when 'restore' then array['action','leagueId','memberId','expectedVersion','idempotencyKey']
   when 'rotateInvite' then array['action','leagueId','expectedVersion','idempotencyKey']
   when 'delete' then array['action','leagueId','expectedVersion','idempotencyKey']
   else null end;
 if allowed is null or exists(select 1 from jsonb_object_keys(request) key where not key=any(allowed)) then raise exception 'INVALID_REQUEST'; end if;
 if uid is null or not exists(select 1 from auth.users where id=uid) then raise exception 'UNAUTHORIZED'; end if;
 -- Lock order step 1: the acting account.
 insert into ranked_private.accounts(user_id) values(uid) on conflict do nothing;
 select nickname_prompted into prompted from ranked_private.accounts where user_id=uid for update;
 now_value:=clock_timestamp();
 insert into ranked_private.friend_league_rate_limits values(uid,now_value,1)
 on conflict(user_id) do update set
   requests=case when ranked_private.friend_league_rate_limits.window_start <= now_value-interval '1 minute' then 1 else ranked_private.friend_league_rate_limits.requests+1 end,
   window_start=case when ranked_private.friend_league_rate_limits.window_start <= now_value-interval '1 minute' then now_value else ranked_private.friend_league_rate_limits.window_start end
 returning requests into n;
 if n>60 then return jsonb_build_object('error',jsonb_build_object('code','RATE_LIMITED','message','Too many requests; retry in a minute.')); end if;
 begin
 -- Field validation (types and bounds), independent of the Edge validator.
 if request ? 'leagueId' and (jsonb_typeof(request->'leagueId') is distinct from 'string' or request->>'leagueId' !~* uuid_pattern) then raise exception 'INVALID_REQUEST'; end if;
 if request ? 'memberId' and (jsonb_typeof(request->'memberId') is distinct from 'string' or request->>'memberId' !~* uuid_pattern) then raise exception 'INVALID_REQUEST'; end if;
 if request ? 'token' and (jsonb_typeof(request->'token') is distinct from 'string' or request->>'token' !~ '^[A-Za-z0-9_-]{43,128}$') then raise exception 'INVALID_REQUEST'; end if;
 if request ? 'period' and (jsonb_typeof(request->'period') is distinct from 'string' or request->>'period' not in ('today','week')) then raise exception 'INVALID_REQUEST'; end if;
 if request ? 'limit' and (jsonb_typeof(request->'limit') is distinct from 'number' or request->>'limit' !~ '^[0-9]{1,2}$' or (request->>'limit')::integer not between 1 and 50) then raise exception 'INVALID_REQUEST'; end if;
 if request ? 'offset' and (jsonb_typeof(request->'offset') is distinct from 'number' or request->>'offset' !~ '^[0-9]{1,5}$' or (request->>'offset')::integer > 10000) then raise exception 'INVALID_REQUEST'; end if;
 if request ? 'expectedVersion' and (jsonb_typeof(request->'expectedVersion') is distinct from 'number' or request->>'expectedVersion' !~ '^[0-9]{1,9}$') then raise exception 'INVALID_REQUEST'; end if;
 if act in ('create','rename') then
   if jsonb_typeof(request->'name') is distinct from 'string' then raise exception 'INVALID_LEAGUE_NAME'; end if;
   nm:=request->>'name';
   if char_length(nm) not between 3 and 40 or nm<>btrim(nm) or nm ~ '[[:cntrl:]]' or nm ~ '^[[:space:]]|[[:space:]]$' then raise exception 'INVALID_LEAGUE_NAME'; end if;
 end if;
 lid:=(request->>'leagueId')::uuid; mid:=(request->>'memberId')::uuid; tok:=request->>'token';
 lim:=coalesce((request->>'limit')::integer,50); off:=coalesce((request->>'offset')::integer,0);
 per:=coalesce(request->>'period','week');
 today:=(ranked_private.utc_now() at time zone 'utc')::date;

 if lid is not null then
   select * into me from ranked_private.friend_league_members where league_id=lid and user_id=uid and state='active';
   -- Outsiders, removed/former members and deleted leagues are indistinguishable.
   if not found and act not in ('leave','delete') then raise exception 'LEAGUE_UNAVAILABLE'; end if;
 end if;

 -- Reads. They may freeze ended weeks but never touch gameplay state.
 if act='list' then
   for lid in select m.league_id from ranked_private.friend_league_members m where m.user_id=uid and m.state='active' order by m.league_id loop
     perform ranked_private.finalize_league(lid,8);
   end loop;
   return jsonb_build_object(
     'leagues',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'name',l.name,'owner',l.owner_id=uid,
        'memberCount',(select count(*) from ranked_private.friend_league_members x where x.league_id=l.id and x.state='active'),
        'trophies',ranked_private.league_trophies(m.id),
        'pending',coalesce(l.finalized_through+7,ranked_private.week_start((l.created_at at time zone 'utc')::date))<ranked_private.week_start(today))
        order by lower(l.name),l.id)
      from ranked_private.friend_league_members m join ranked_private.friend_leagues l on l.id=m.league_id
      where m.user_id=uid and m.state='active'),'[]'::jsonb),
     'limits',jsonb_build_object('leagues',10,'members',50),
     'nicknameReady',coalesce(prompted,false));
 end if;
 if act='preview' then
   select l.* into lg from ranked_private.friend_league_invites i join ranked_private.friend_leagues l on l.id=i.league_id where i.token=tok;
   if not found then raise exception 'INVITE_UNAVAILABLE'; end if;
   select * into target from ranked_private.friend_league_members where league_id=lg.id and user_id=uid;
   if found and target.state='removed' then raise exception 'INVITE_UNAVAILABLE'; end if;
   return jsonb_build_object(
     'league',jsonb_build_object('name',lg.name,'memberCount',(select count(*) from ranked_private.friend_league_members where league_id=lg.id and state='active'))
        || case when found and target.state='active' then jsonb_build_object('id',lg.id) else '{}'::jsonb end,
     'member',found and target.state='active',
     'full',(select count(*) from ranked_private.friend_league_members where league_id=lg.id and state='active')>=50,
     'atLimit',(select count(*) from ranked_private.friend_league_members where user_id=uid and state='active')>=10,
     'nicknameReady',coalesce(prompted,false),
     'todayPlayed',(select count(*) from ranked_private.daily_results where user_id=uid and date=today));
 end if;
 if act in ('standings','history','memberWins') then
   pending:=ranked_private.finalize_league(lid,8);
   if act='standings' then return ranked_private.league_standings(lid,uid,today,per,lim,off,pending); end if;
   if act='history' then return ranked_private.league_history(lid,lim,off,pending); end if;
   if not exists(select 1 from ranked_private.friend_league_members where id=mid and league_id=lid) then raise exception 'MEMBER_NOT_FOUND'; end if;
   return ranked_private.league_member_wins(lid,mid,lim,off,pending);
 end if;
 if act='manage' then
   if not exists(select 1 from ranked_private.friend_leagues where id=lid and owner_id=uid) then raise exception 'FORBIDDEN'; end if;
   return ranked_private.league_manage(lid);
 end if;

 -- Mutations: idempotency first. Concurrent duplicates serialize on the
 -- account lock above, so the second sees the first's committed receipt.
 if coalesce(request->>'idempotencyKey','') !~* uuid_pattern then raise exception 'INVALID_REQUEST'; end if;
 k:=(request->>'idempotencyKey')::uuid;
 digest:=encode(sha256(convert_to((request-'idempotencyKey')::text,'UTF8')),'hex');
 select * into cached from ranked_private.friend_league_receipts where user_id=uid and key=k;
 if found then
   if cached.request_digest<>digest then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
   -- Replays recheck current access; an old receipt never re-opens a league.
   if cached.action in ('create','join') and not exists(select 1 from ranked_private.friend_league_members where league_id=cached.league_id and user_id=uid and state='active') then raise exception 'LEAGUE_UNAVAILABLE'; end if;
   if cached.action in ('rename','remove','restore','rotateInvite') and not exists(select 1 from ranked_private.friend_leagues where id=cached.league_id and owner_id=uid) then raise exception 'LEAGUE_UNAVAILABLE'; end if;
   return cached.response;
 end if;

 if act='create' then
   if not coalesce(prompted,false) then raise exception 'NICKNAME_REQUIRED'; end if;
   if (select count(*) from ranked_private.friend_league_members where user_id=uid and state='active')>=10 then raise exception 'LEAGUE_LIMIT'; end if;
   now_value:=ranked_private.utc_now();
   insert into ranked_private.friend_leagues(owner_id,name,created_at) values(uid,nm,now_value) returning id into lid;
   insert into ranked_private.friend_league_members(league_id,user_id,state,state_changed_at) values(lid,uid,'active',now_value) returning id into mid;
   insert into ranked_private.friend_league_member_intervals(member_id,joined_at) values(mid,now_value);
   insert into ranked_private.friend_league_invites(league_id,token,rotated_at) values(lid,ranked_private.new_invite_token(),now_value);
   result:=jsonb_build_object('leagueId',lid);
 elsif act='join' then
   if not coalesce(prompted,false) then raise exception 'NICKNAME_REQUIRED'; end if;
   select league_id into lid from ranked_private.friend_league_invites where token=tok;
   if not found then raise exception 'INVITE_UNAVAILABLE'; end if;
   -- Lock order step 2. Rotation takes the same lock, so recheck the token:
   -- a rotation that committed first must win.
   select * into lg from ranked_private.friend_leagues where id=lid for update;
   if not found or not exists(select 1 from ranked_private.friend_league_invites where league_id=lid and token=tok) then raise exception 'INVITE_UNAVAILABLE'; end if;
   select * into target from ranked_private.friend_league_members where league_id=lid and user_id=uid;
   if found and target.state='removed' then raise exception 'INVITE_UNAVAILABLE'; end if;
   if found and target.state='active' then
     result:=jsonb_build_object('leagueId',lid,'joined',true);
   else
     if (select count(*) from ranked_private.friend_league_members where user_id=uid and state='active')>=10 then raise exception 'LEAGUE_LIMIT'; end if;
     if (select count(*) from ranked_private.friend_league_members where league_id=lid and state='active')>=50 then raise exception 'LEAGUE_FULL'; end if;
     perform ranked_private.finalize_league(lid,1000000);
     now_value:=ranked_private.utc_now();
     if target.id is null then
       insert into ranked_private.friend_league_members(league_id,user_id,state,state_changed_at) values(lid,uid,'active',now_value) returning id into mid;
     else
       mid:=target.id;
       select max(left_at) into last_left from ranked_private.friend_league_member_intervals where member_id=mid;
       now_value:=greatest(now_value,last_left);
       update ranked_private.friend_league_members set state='active',state_changed_at=now_value where id=mid;
     end if;
     insert into ranked_private.friend_league_member_intervals(member_id,joined_at) values(mid,now_value);
     result:=jsonb_build_object('leagueId',lid,'joined',true);
   end if;
 elsif act='leave' then
   if me.id is null then
     -- Already gone (or never a member): acknowledge without private data.
     result:=jsonb_build_object('left',true);
   else
     select * into lg from ranked_private.friend_leagues where id=lid for update;
     if lg.owner_id=uid then raise exception 'OWNER_CANNOT_LEAVE'; end if;
     perform ranked_private.finalize_league(lid,1000000);
     now_value:=ranked_private.utc_now();
     update ranked_private.friend_league_member_intervals set left_at=now_value where member_id=me.id and left_at is null;
     update ranked_private.friend_league_members set state='left',state_changed_at=now_value where id=me.id;
     result:=jsonb_build_object('left',true);
   end if;
 else
   -- Owner mutations.
   if me.id is null then raise exception 'LEAGUE_UNAVAILABLE'; end if;
   select * into lg from ranked_private.friend_leagues where id=lid for update;
   if lg.owner_id<>uid then raise exception 'FORBIDDEN'; end if;
   if lg.version<>(request->>'expectedVersion')::integer then raise exception 'VERSION_CONFLICT'; end if;
   now_value:=ranked_private.utc_now();
   if act='delete' then
     delete from ranked_private.friend_leagues where id=lid;
     result:=jsonb_build_object('deleted',true);
   else
     if act='rename' then
       update ranked_private.friend_leagues set name=nm where id=lid;
     elsif act='rotateInvite' then
       update ranked_private.friend_league_invites set token=ranked_private.new_invite_token(),rotated_at=now_value where league_id=lid;
     else
       select * into target from ranked_private.friend_league_members where id=mid and league_id=lid;
       per:=case act when 'remove' then 'active' else 'removed' end;
       if not found or target.user_id=uid or target.state<>per then raise exception 'MEMBER_NOT_FOUND'; end if;
       if act='remove' then
         perform ranked_private.finalize_league(lid,1000000);
         update ranked_private.friend_league_member_intervals set left_at=now_value where member_id=mid and left_at is null;
         update ranked_private.friend_league_members set state='removed',state_changed_at=now_value where id=mid;
       else
         -- Eligibility only: no slot, no interval; they must join again.
         update ranked_private.friend_league_members set state='left',state_changed_at=now_value where id=mid;
       end if;
     end if;
     update ranked_private.friend_leagues set version=version+1 where id=lid returning version into n;
     result:=jsonb_build_object('leagueId',lid,'version',n);
   end if;
 end if;
 insert into ranked_private.friend_league_receipts(user_id,key,request_digest,action,league_id,response) values(uid,k,digest,act,lid,result);
 return result;
 exception
   when raise_exception then return jsonb_build_object('error',jsonb_build_object('code',sqlerrm,'message',sqlerrm));
   when invalid_text_representation or numeric_value_out_of_range or check_violation then return jsonb_build_object('error',jsonb_build_object('code','INVALID_REQUEST','message','Invalid request.'));
 end;
end $$;

-- Account deletion (auth.users -> accounts cascade) runs this BEFORE the
-- accounts row and its Daily results disappear: owned leagues are deleted
-- outright; every other league the account ever belonged to first freezes
-- its ended weeks through the same cutoff barrier, then the membership is
-- closed and anonymized. Finalized winners stay winners as "Deleted player";
-- nobody is promoted. SECURITY DEFINER because the Auth service role that
-- performs the cascade has no grants on ranked_private.
create function ranked_private.friend_leagues_account_deleted() returns trigger
language plpgsql security definer set search_path = '' as $$
declare lid uuid; now_value timestamptz := ranked_private.utc_now();
begin
 for lid in select id from ranked_private.friend_leagues where owner_id=old.user_id order by id loop
   delete from ranked_private.friend_leagues where id=lid;
 end loop;
 for lid in select league_id from ranked_private.friend_league_members where user_id=old.user_id order by league_id loop
   perform ranked_private.finalize_league(lid,1000000);
 end loop;
 update ranked_private.friend_league_member_intervals i set left_at=now_value
 from ranked_private.friend_league_members m where m.id=i.member_id and m.user_id=old.user_id and i.left_at is null;
 update ranked_private.friend_league_members set state='deleted',user_id=null,state_changed_at=now_value where user_id=old.user_id;
 return old;
end $$;
create trigger friend_leagues_account_deleted before delete on ranked_private.accounts
for each row execute function ranked_private.friend_leagues_account_deleted();

-- Daily cutoff barrier: full public.ranked_game body copied from
-- 202609280001_mandatory_nickname_prompt.sql (the current definition) with
-- only the dailyHint/dailyAnswer branch changed: it takes the SHARED week
-- cutoff lock for its UTC date's week, then rejects the write as
-- ROUND_NOT_FOUND if the UTC week has rolled over while it waited (a fresh
-- request would see no round for the new date either). A finalizer holds
-- the same lock EXCLUSIVELY, so no Daily write can land in a week after it
-- is frozen, and every write that got in first is included. The branch's
-- date and finished_at read ranked_private.utc_now() (= clock_timestamp()).
-- Scoring (ranked_private.points over clock_timestamp()-started_at), clocks,
-- streaks, receipts and every other action are byte-identical.
create or replace function public.ranked_game(verified_user_id uuid, request jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
 uid uuid := verified_user_id;
 act text := request->>'action';
 comp text := coalesce(request->>'competition','all');
 k uuid; digest text; cached ranked_private.receipts%rowtype;
 r ranked_private.rounds%rowtype; pid text; opts jsonb; correct_id uuid;
 result jsonb; version_value integer; option_value uuid;
 now_value timestamptz; n integer; lim integer; off integer; allowed text[];
 have_round boolean;
 today date; req_round_index integer; dr ranked_private.daily_rounds%rowtype;
 slot integer; sched ranked_private.daily_schedule%rowtype; streak_next integer;
begin
 if request is null or jsonb_typeof(request) <> 'object' or act is null then raise exception 'INVALID_REQUEST'; end if;
 allowed := case act
   when 'progress' then array['action']
   when 'start' then array['action','competition','idempotencyKey']
   when 'hint' then array['action','roundId','expectedVersion','idempotencyKey']
   when 'answer' then array['action','roundId','expectedVersion','optionId','idempotencyKey']
   when 'enroll' then array['action','nickname','idempotencyKey']
   when 'leaderboard' then array['action','competition','limit','offset']
   when 'dailyProgress' then array['action']
   when 'dailyHint' then array['action','roundIndex','expectedVersion','idempotencyKey']
   when 'dailyAnswer' then array['action','roundIndex','expectedVersion','optionId','idempotencyKey']
   when 'dailyStreakLeaderboard' then array['action','limit','offset'] else null end;
 if allowed is null or exists(select 1 from jsonb_object_keys(request) key where not key=any(allowed)) then raise exception 'INVALID_REQUEST'; end if;
 if act not in ('leaderboard','dailyStreakLeaderboard') and not exists(select 1 from ranked_private.competitions where id=comp) then raise exception 'INVALID_COMPETITION'; end if;
 if act='leaderboard' then
   lim:=coalesce((request->>'limit')::integer,25); off:=coalesce((request->>'offset')::integer,0);
   if lim not between 1 and 100 or off not between 0 and 10000 then raise exception 'INVALID_REQUEST'; end if;
   return ranked_private.leaderboard(uid,comp,lim,off);
 end if;
 if act='dailyStreakLeaderboard' then
   lim:=coalesce((request->>'limit')::integer,25); off:=coalesce((request->>'offset')::integer,0);
   if lim not between 1 and 100 or off not between 0 and 10000 then raise exception 'INVALID_REQUEST'; end if;
   return ranked_private.daily_streak_leaderboard(uid,lim,off);
 end if;
 if uid is null or not exists(select 1 from auth.users where id=uid) then raise exception 'UNAUTHORIZED'; end if;
 insert into ranked_private.accounts(user_id) values(uid) on conflict do nothing;
 perform 1 from ranked_private.accounts where user_id=uid for update;
 now_value:=clock_timestamp();
 insert into ranked_private.rate_limits values(uid,now_value,1)
 on conflict(user_id) do update set
   requests=case when ranked_private.rate_limits.window_start <= now_value-interval '1 minute' then 1 else ranked_private.rate_limits.requests+1 end,
   window_start=case when ranked_private.rate_limits.window_start <= now_value-interval '1 minute' then now_value else ranked_private.rate_limits.window_start end
 returning requests into n;
 if n>120 then return jsonb_build_object('error',jsonb_build_object('code','RATE_LIMITED','message','Too many requests; retry in a minute.')); end if;
 begin
 if act='progress' then return ranked_private.projection(uid); end if;
 if act='dailyProgress' then
   today:=(clock_timestamp() at time zone 'utc')::date;
   for req_round_index in 0..2 loop
     if not exists(select 1 from ranked_private.daily_rounds where user_id=uid and date=today and round_index=req_round_index) then
       slot:=ranked_private.daily_slot_index(today,req_round_index);
       select * into sched from ranked_private.daily_schedule where slot_index=slot;
       if found then
         with shuffled as (
           select gen_random_uuid() id,c.id candidate_id,c.label,random() ordering
           from unnest(sched.option_candidate_ids) as q(candidate_id)
           join ranked_private.candidates c on c.id=q.candidate_id
         )
         select jsonb_agg(jsonb_build_object('id',id,'label',label) order by ordering),
           (array_agg(id) filter(where candidate_id=sched.player_id))[1] into opts,correct_id from shuffled;
         insert into ranked_private.daily_rounds(user_id,date,round_index,slot_index,player_id,options,correct_option)
         values(uid,today,req_round_index,slot,sched.player_id,opts,correct_id)
         on conflict(user_id,date,round_index) do nothing;
       end if;
     end if;
   end loop;
   return ranked_private.daily_projection(uid);
 end if;
 if coalesce(request->>'idempotencyKey','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'INVALID_REQUEST'; end if;
 k:=(request->>'idempotencyKey')::uuid;
 digest:=encode(sha256(convert_to((request-'idempotencyKey')::text,'UTF8')),'hex');
 select * into cached from ranked_private.receipts where user_id=uid and key=k;
 if found then
   if cached.request_digest<>digest then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
   return cached.response;
 end if;
 if act='enroll' then
   if jsonb_typeof(request->'nickname') is distinct from 'string' or char_length(request->>'nickname') not between 3 and 24 or (request->>'nickname') !~ '^[[:alnum:] _.-]+$' or request->>'nickname' <> btrim(request->>'nickname') then raise exception 'INVALID_NICKNAME'; end if;
   update ranked_private.accounts set nickname=request->>'nickname',enrolled=true,nickname_prompted=true where user_id=uid;
   result:=ranked_private.projection(uid);
 elsif act='start' then
   select * into r from ranked_private.rounds where user_id=uid and status='playing';
   -- FOUND is implicitly reset by the next statement (including the DELETE
   -- below), so the decision is carried in a dedicated flag.
   have_round:=found;
   -- ADR 0023: started_at is set when the ROW IS CREATED, and this branch hands
   -- back any existing playing round. Landing on the site signed in creates a
   -- round whether or not the player engages with it, so closing the tab and
   -- returning later resurrected an untouched round with an hours-old clock -
   -- displaying e.g. "73:25" and pinning the score to the 25% floor before the
   -- puzzle had ever been looked at. An UNTOUCHED round (no guesses, no hints)
   -- older than the stale window is therefore discarded and replaced.
   -- Deliberately narrow: the moment a player spends a hint or a guess the
   -- round is engaged and is never replaced however old it gets, so walking
   -- away can never buy a fresh clock. Abandoning writes no result row, so the
   -- player id is not consumed and nothing can be farmed.
   if have_round and cardinality(r.guesses)=0 and r.hints=0
      and clock_timestamp()-r.started_at > interval '30 minutes' then
     delete from ranked_private.rounds where id=r.id;
     have_round:=false;
   end if;
   if not have_round then
     select p.id into pid from ranked_private.players p join ranked_private.memberships m on m.player_id=p.id and m.competition=comp
     where not exists(select 1 from ranked_private.results x where x.user_id=uid and x.player_id=p.id and x.ruleset='v2')
     order by random() limit 1;
     if pid is null then
       result:=jsonb_set(ranked_private.projection(uid),'{round}','null'::jsonb) || jsonb_build_object('completed',true);
     else
       with selected as (
         select candidate_id from ranked_private.rivals where player_id=pid
         order by tier, (similarity + case when comp=any(competitions) then 2 else 0 end + 3*random()) desc limit 9
       ), choices as (select candidate_id from selected union all select pid),
       shuffled as (select gen_random_uuid() id,c.id candidate_id,c.label,random() ordering from choices q join ranked_private.candidates c on c.id=q.candidate_id)
       select jsonb_agg(jsonb_build_object('id',id,'label',label) order by ordering),
         (array_agg(id) filter(where candidate_id=pid))[1] into opts,correct_id from shuffled;
       insert into ranked_private.rounds(user_id,player_id,competition,options,correct_option)
       values(uid,pid,comp,opts,correct_id) returning * into r;
     end if;
   end if;
   if result is null then result:=ranked_private.projection(uid,r.id); end if;
 elsif act in ('dailyHint','dailyAnswer') then
   if jsonb_typeof(request->'roundIndex') is distinct from 'number'
     or coalesce(request->>'roundIndex','') !~ '^[0-9]$' or (request->>'roundIndex')::integer not between 0 and 2
     or jsonb_typeof(request->'expectedVersion') is distinct from 'number'
     or coalesce(request->>'expectedVersion','') !~ '^[0-9]{1,9}$' then raise exception 'INVALID_REQUEST'; end if;
   req_round_index:=(request->>'roundIndex')::integer;
   version_value:=(request->>'expectedVersion')::integer;
   today:=(ranked_private.utc_now() at time zone 'utc')::date;
   -- Private-league week cutoff barrier (see header comment).
   perform pg_advisory_xact_lock_shared(20261008, ranked_private.week_lock_key(ranked_private.week_start(today)));
   if ranked_private.week_start((ranked_private.utc_now() at time zone 'utc')::date)<>ranked_private.week_start(today) then raise exception 'ROUND_NOT_FOUND'; end if;
   select * into dr from ranked_private.daily_rounds where user_id=uid and date=today and round_index=req_round_index for update;
   if not found then raise exception 'ROUND_NOT_FOUND'; end if;
   if dr.version<>version_value then raise exception 'VERSION_CONFLICT'; end if;
   if dr.status<>'playing' then raise exception 'ROUND_FINISHED'; end if;
   if req_round_index>0 and exists(
     select 1 from ranked_private.daily_rounds
     where user_id=uid and date=today and round_index<req_round_index and status='playing'
   ) then raise exception 'ROUND_LOCKED'; end if;
   if act='dailyHint' then
     if dr.hints>=3 then raise exception 'HINT_LIMIT'; end if;
     dr.hints:=dr.hints+1;
   else
     if coalesce(request->>'optionId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'INVALID_OPTION'; end if;
     option_value:=(request->>'optionId')::uuid;
     if not exists(select 1 from jsonb_array_elements(dr.options) o where o->>'id'=option_value::text) then raise exception 'INVALID_OPTION'; end if;
     if option_value=any(dr.guesses) then raise exception 'ALREADY_GUESSED'; end if;
     dr.guesses:=array_append(dr.guesses,option_value);
     if option_value=dr.correct_option then
       dr.status:='won';
       dr.points:=ranked_private.points(dr.hints,extract(epoch from clock_timestamp()-dr.started_at)*1000);
     elsif cardinality(dr.guesses)=3 then dr.status:='lost'; end if;
   end if;
   if dr.status<>'playing' then dr.finished_at:=ranked_private.utc_now(); end if;
   update ranked_private.daily_rounds set version=version+1,hints=dr.hints,guesses=dr.guesses,status=dr.status,points=dr.points,finished_at=dr.finished_at
   where user_id=uid and date=today and round_index=req_round_index;
   if dr.status<>'playing' then
     insert into ranked_private.daily_results(user_id,date,round_index,player_id,points,correct,finished_at)
     values(uid,today,req_round_index,dr.player_id,dr.points,dr.status='won',dr.finished_at);
     if req_round_index=2 then
       streak_next:=1;
       select case when last_completed_date=today-1 then current_streak+1 else 1 end into streak_next
       from ranked_private.daily_streaks where user_id=uid;
       if not found then streak_next:=1; end if;
       insert into ranked_private.daily_streaks(user_id,current_streak,best_streak,last_completed_date)
       values(uid,streak_next,streak_next,today)
       on conflict(user_id) do update set
         current_streak=streak_next,
         best_streak=greatest(ranked_private.daily_streaks.best_streak,streak_next),
         last_completed_date=today
       where ranked_private.daily_streaks.last_completed_date is distinct from today;
     end if;
   end if;
   result:=ranked_private.daily_projection(uid);
 else
   if coalesce(request->>'roundId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or jsonb_typeof(request->'expectedVersion') is distinct from 'number'
     or coalesce(request->>'expectedVersion','') !~ '^[0-9]{1,9}$' then raise exception 'INVALID_REQUEST'; end if;
   version_value:=(request->>'expectedVersion')::integer;
   select * into r from ranked_private.rounds where id=(request->>'roundId')::uuid and user_id=uid for update;
   if not found then raise exception 'ROUND_NOT_FOUND'; end if;
   if r.version<>version_value then raise exception 'VERSION_CONFLICT'; end if;
   if r.status<>'playing' then raise exception 'ROUND_FINISHED'; end if;
   if act='hint' then
     if r.hints>=3 then raise exception 'HINT_LIMIT'; end if;
     r.hints:=r.hints+1;
   else
     if coalesce(request->>'optionId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'INVALID_OPTION'; end if;
     option_value:=(request->>'optionId')::uuid;
     if not exists(select 1 from jsonb_array_elements(r.options) o where o->>'id'=option_value::text) then raise exception 'INVALID_OPTION'; end if;
     if option_value=any(r.guesses) then raise exception 'ALREADY_GUESSED'; end if;
     r.guesses:=array_append(r.guesses,option_value);
     if option_value=r.correct_option then
       r.status:='won';
       r.points:=ranked_private.points(r.hints,extract(epoch from clock_timestamp()-r.started_at)*1000);
     elsif cardinality(r.guesses)=3 then r.status:='lost'; end if;
   end if;
   if r.status<>'playing' then r.finished_at:=clock_timestamp(); end if;
   update ranked_private.rounds set version=version+1,hints=r.hints,guesses=r.guesses,status=r.status,points=r.points,finished_at=r.finished_at where id=r.id;
   if r.status<>'playing' then
     insert into ranked_private.results(user_id,player_id,ruleset,round_id,points,correct,finished_at)
     values(uid,r.player_id,r.ruleset,r.id,r.points,r.status='won',r.finished_at);
   end if;
   result:=ranked_private.projection(uid,r.id);
 end if;
 insert into ranked_private.receipts(user_id,key,request_digest,response) values(uid,k,digest,result);
 return result;
 exception
   when unique_violation then return jsonb_build_object('error',jsonb_build_object('code','NICKNAME_TAKEN','message','Nickname already used.'));
   when raise_exception then return jsonb_build_object('error',jsonb_build_object('code',sqlerrm,'message',sqlerrm));
   when invalid_text_representation or numeric_value_out_of_range or check_violation then return jsonb_build_object('error',jsonb_build_object('code','INVALID_REQUEST','message','Invalid request.'));
 end;
end $$;

revoke all on all functions in schema ranked_private from public, anon, authenticated, service_role;
revoke all on function public.ranked_game(uuid,jsonb) from public, anon, authenticated;
grant execute on function public.ranked_game(uuid,jsonb) to service_role;
revoke all on function public.private_leagues(uuid,jsonb) from public, anon, authenticated;
grant execute on function public.private_leagues(uuid,jsonb) to service_role;

commit;
