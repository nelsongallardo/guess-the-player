-- Moves ranked mode from 5 options (1 correct + 4 rivals) to 10 (1 + 9),
-- matching guest/practice's own harder-game decision (see ADR 0002's
-- amendment, which deliberately left ranked's schema untouched pending a
-- real migration). Guessing among 10 is a meaningfully harder task than 5
-- (a lucky guess drops from 1-in-5 to 1-in-10), so this ships as a new
-- ruleset ('v2') rather than silently widening 'v1' in place: every
-- already-earned v1 result stays exactly as recorded, immutable, but the
-- active leaderboard and account progress now reflect v2 only - accounts
-- effectively start the board fresh under the new format. See
-- docs/adr/0012-ranked-ten-options-v2-ruleset.md.
begin;

-- Both rounds.ruleset and results.ruleset were already columns (forward-
-- looking from the original schema) but hard-locked to the single literal
-- 'v1'. Drop each check by inspecting its actual definition rather than
-- assuming an auto-generated name, same as 202609140002_ranked_third_hint.sql.
do $$
declare cname text;
begin
  select conname into cname from pg_constraint
    where conrelid = 'ranked_private.rounds'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%ruleset%';
  if cname is not null then execute format('alter table ranked_private.rounds drop constraint %I', cname); end if;
end $$;
alter table ranked_private.rounds add constraint rounds_ruleset_check check(ruleset in ('v1','v2'));
alter table ranked_private.rounds alter column ruleset set default 'v2';

-- Tie option count to ruleset directly in the constraint, so the database
-- itself can never end up with a v1 round holding 10 options or a v2 round
-- holding 5, rather than trusting application code alone.
do $$
declare cname text;
begin
  select conname into cname from pg_constraint
    where conrelid = 'ranked_private.rounds'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%jsonb_array_length(options)%';
  if cname is not null then execute format('alter table ranked_private.rounds drop constraint %I', cname); end if;
end $$;
alter table ranked_private.rounds add constraint rounds_options_check
  check((ruleset = 'v1' and jsonb_array_length(options) = 5) or (ruleset = 'v2' and jsonb_array_length(options) = 10));

do $$
declare cname text;
begin
  select conname into cname from pg_constraint
    where conrelid = 'ranked_private.results'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%ruleset%';
  if cname is not null then execute format('alter table ranked_private.results drop constraint %I', cname); end if;
end $$;
alter table ranked_private.results add constraint results_ruleset_check check(ruleset in ('v1','v2'));

-- Every aggregate against results now filters ruleset='v2', so the active
-- board/progress reflect only the new format. v1 rows stay in the table,
-- immutable, simply excluded from these live aggregates - not deleted.
create or replace function ranked_private.projection(uid uuid, rid uuid default null) returns jsonb
language sql stable set search_path = '' as $$
 select jsonb_build_object(
 'profile',(select case when nickname is null then null else jsonb_build_object('nickname',nickname,'enrolled',enrolled) end from ranked_private.accounts where user_id=uid),
 'progress',jsonb_build_object(
   'totalPoints',coalesce((select sum(points) from ranked_private.results where user_id=uid and ruleset='v2'),0),
   'answered',(select count(*) from ranked_private.results where user_id=uid and ruleset='v2'),
   'correct',(select count(*) from ranked_private.results where user_id=uid and ruleset='v2' and correct),
   'seenPlayerIds',coalesce((select jsonb_agg(player_id order by player_id) from ranked_private.results where user_id=uid and ruleset='v2'),'[]'::jsonb),
   'competitionCounts',(select jsonb_object_agg(id,jsonb_build_object('answered',answered,'total',total)) from (
      select c.id,count(r.player_id) answered,count(m.player_id) total
      from ranked_private.competitions c left join ranked_private.memberships m on m.competition=c.id
      left join ranked_private.results r on r.player_id=m.player_id and r.user_id=uid and r.ruleset='v2'
      group by c.id) counts)),
 'round',(select jsonb_build_object('id',r.id,'version',r.version,'playerId',r.player_id,'competition',r.competition,
   'options',r.options,'guesses',to_jsonb(r.guesses),'hints',r.hints,
   'clueCountry',case when r.hints>=1 then p.country else null end,
   'cluePosition',case when r.hints>=2 then p.position else null end,
   'status',r.status,'points',r.points,'startedAt',r.started_at)
   from ranked_private.rounds r join ranked_private.players p on p.id=r.player_id
   where r.user_id=uid and (rid is null or r.id=rid)
   order by r.started_at desc,r.id limit 1))
$$;

create or replace function ranked_private.leaderboard(uid uuid, competition_id text, page_limit integer, page_offset integer) returns jsonb
language sql stable set search_path = '' as $$
 with scores as (
   select a.user_id,a.nickname,coalesce(sum(r.points),0) points,count(r.player_id) answered,
     count(r.player_id) filter(where r.correct) correct
   from ranked_private.accounts a
   left join (ranked_private.results r join ranked_private.memberships m on m.player_id=r.player_id and m.competition=competition_id)
     on r.user_id=a.user_id and r.ruleset='v2'
   where a.enrolled group by a.user_id,a.nickname
   -- Enrollment alone is not a score; a verified loss still qualifies at zero points.
   having count(r.player_id)>0
 ), ranked as (select *,rank() over(order by points desc) as rank from scores),
 page as (select * from ranked order by points desc,lower(nickname),nickname limit page_limit offset page_offset)
 select jsonb_build_object('entries',coalesce((select jsonb_agg(jsonb_build_object('nickname',nickname,'points',points,'answered',answered,'correct',correct,'rank',rank) order by points desc,lower(nickname),nickname) from page),'[]'::jsonb),
 'own',(select jsonb_build_object('nickname',nickname,'points',points,'answered',answered,'correct',correct,'rank',rank) from ranked where user_id=uid),
 'total',(select count(*) from ranked),'competition',competition_id)
$$;

-- Full function body copied from 202609140002_ranked_third_hint.sql with:
--  - the 'start' rival limit raised from 4 to 9 (10 options total)
--  - the "already answered" exclusion switched from ruleset='v1' to 'v2'
--  - the results insert's hardcoded 'v1' replaced with the round's own
--    r.ruleset, so an in-flight v1 round (already dealt 5 options before
--    this migration) still resolves and records correctly as v1
-- every other line is unchanged.
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
begin
 -- PUBLIC/anon/authenticated have no EXECUTE. Never derive identity from a
 -- payload, mutable auth.uid setting or caller-supplied JWT claims here.
 if request is null or jsonb_typeof(request) <> 'object' or act is null then raise exception 'INVALID_REQUEST'; end if;
 allowed := case act
   when 'progress' then array['action']
   when 'start' then array['action','competition','idempotencyKey']
   when 'hint' then array['action','roundId','expectedVersion','idempotencyKey']
   when 'answer' then array['action','roundId','expectedVersion','optionId','idempotencyKey']
   when 'enroll' then array['action','nickname','idempotencyKey']
   when 'leaderboard' then array['action','competition','limit','offset'] else null end;
 if allowed is null or exists(select 1 from jsonb_object_keys(request) key where not key=any(allowed)) then raise exception 'INVALID_REQUEST'; end if;
 if not exists(select 1 from ranked_private.competitions where id=comp) then raise exception 'INVALID_COMPETITION'; end if;
 if act='leaderboard' then
   lim:=coalesce((request->>'limit')::integer,25); off:=coalesce((request->>'offset')::integer,0);
   if lim not between 1 and 100 or off not between 0 and 10000 then raise exception 'INVALID_REQUEST'; end if;
   return ranked_private.leaderboard(uid,comp,lim,off);
 end if;
 if uid is null or not exists(select 1 from auth.users where id=uid) then raise exception 'UNAUTHORIZED'; end if;
 insert into ranked_private.accounts(user_id) values(uid) on conflict do nothing;
 -- Serialize every account request, including start and receipt lookup. A second
 -- device cannot open another round, spend a hint twice or race a result insert.
 perform 1 from ranked_private.accounts where user_id=uid for update;
 now_value:=clock_timestamp();
 insert into ranked_private.rate_limits values(uid,now_value,1)
 on conflict(user_id) do update set
   requests=case when ranked_private.rate_limits.window_start <= now_value-interval '1 minute' then 1 else ranked_private.rate_limits.requests+1 end,
   window_start=case when ranked_private.rate_limits.window_start <= now_value-interval '1 minute' then now_value else ranked_private.rate_limits.window_start end
 returning requests into n;
 if n>120 then return jsonb_build_object('error',jsonb_build_object('code','RATE_LIMITED','message','Too many requests; retry in a minute.')); end if;
 -- Errors are caught inside this subtransaction so rejected transitions still
 -- consume the account rate budget; failed mutations have no partial writes.
 begin
 if act='progress' then return ranked_private.projection(uid); end if;
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
   update ranked_private.accounts set nickname=request->>'nickname',enrolled=true where user_id=uid;
   result:=ranked_private.projection(uid);
 elsif act='start' then
   select * into r from ranked_private.rounds where user_id=uid and status='playing';
   if not found then
     select p.id into pid from ranked_private.players p join ranked_private.memberships m on m.player_id=p.id and m.competition=comp
     where not exists(select 1 from ranked_private.results x where x.user_id=uid and x.player_id=p.id and x.ruleset='v2')
     order by random() limit 1;
     if pid is null then
       result:=jsonb_set(ranked_private.projection(uid),'{round}','null'::jsonb) || jsonb_build_object('completed',true);
     else
       -- Lexicographic tier priority preserves every tighter-tier candidate;
       -- boundary tier uses exactly the model's similarity + competition bonus
       -- + uniform [0,3) noise, with shuffled final answer positions.
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

commit;
