-- Adds server-authoritative Daily Rabona for signed-in accounts, counted
-- into the public leaderboard alongside ranked ("career") results, plus a
-- server-side daily streak and its own streak leaderboard.
--
-- Deliberately does NOT touch ranked_private.results/rounds at all: their
-- primary key (user_id,player_id,ruleset) encodes "once ever per player",
-- which must NOT apply to daily - the 220-slot schedule cycles forever, so
-- the same player legitimately recurs across daily challenges, and may
-- already have a separate ranked result for that same player. Daily gets
-- its own fully independent tables with no FK/uniqueness relationship to
-- the ranked ones.
begin;

create table ranked_private.daily_schedule (
  slot_index integer primary key check(slot_index between 0 and 219),
  player_id text not null references ranked_private.players(id),
  option_candidate_ids text[] not null check(cardinality(option_candidate_ids) = 10)
);

create table ranked_private.daily_rounds (
  user_id uuid not null references ranked_private.accounts(user_id) on delete cascade,
  date date not null,
  round_index integer not null check(round_index between 0 and 2),
  slot_index integer not null references ranked_private.daily_schedule(slot_index),
  player_id text not null references ranked_private.players(id),
  options jsonb not null check(jsonb_array_length(options) = 10),
  correct_option uuid not null,
  guesses uuid[] not null default '{}' check(cardinality(guesses) <= 3),
  hints integer not null default 0 check(hints between 0 and 3),
  status text not null default 'playing' check(status in ('playing','won','lost')),
  points integer not null default 0 check(points between 0 and 100),
  version integer not null default 0 check(version >= 0),
  started_at timestamptz not null default clock_timestamp(),
  finished_at timestamptz,
  primary key(user_id,date,round_index),
  check((status = 'playing') = (finished_at is null)),
  check(status = 'won' or points = 0)
);
-- No extra partial-unique "one open round" index needed here (unlike
-- ranked_private.rounds): "date" is always the server's own current UTC
-- date at insert time, never client-supplied, so the PK alone guarantees
-- at most one row per slot per day per user.

create table ranked_private.daily_results (
  user_id uuid not null references ranked_private.accounts(user_id) on delete cascade,
  date date not null,
  round_index integer not null check(round_index between 0 and 2),
  player_id text not null references ranked_private.players(id),
  points integer not null check(points between 0 and 100),
  correct boolean not null,
  finished_at timestamptz not null,
  primary key(user_id,date,round_index),
  check(correct or points = 0)
);
-- Reuse the existing generic immutability trigger function (it only raises
-- RESULT_IMMUTABLE, no table-specific references) rather than defining a
-- second copy.
create trigger immutable_daily_result before update on ranked_private.daily_results
for each row execute function ranked_private.immutable_result();

create table ranked_private.daily_streaks (
  user_id uuid primary key references ranked_private.accounts(user_id) on delete cascade,
  current_streak integer not null default 0 check(current_streak >= 0),
  best_streak integer not null default 0 check(best_streak >= current_streak),
  last_completed_date date,
  check(current_streak = 0 or last_completed_date is not null)
);

do $$ declare t text; begin
  foreach t in array array['daily_schedule','daily_rounds','daily_results','daily_streaks'] loop
    execute format('alter table ranked_private.%I enable row level security',t);
    execute format('revoke all on ranked_private.%I from public, anon, authenticated, service_role',t);
  end loop;
end $$;

-- Mirrors DailyChallenge.forDate's epoch/modulo arithmetic in index.html's
-- daily-challenge script block (EPOCH_DAY = 2026-09-17 UTC = challenge #1,
-- start=((challengeNumber-1)*3)%220). Kept as pure SQL helpers so both the
-- schedule lookup and the RPC dispatch can share one definition.
create function ranked_private.daily_challenge_number(d date) returns integer
language sql immutable set search_path = '' as $$
  select (d - date '2026-09-17')::integer + 1
$$;

create function ranked_private.daily_slot_index(d date, round_index integer) returns integer
language sql immutable set search_path = '' as $$
  select (((ranked_private.daily_challenge_number(d) - 1) * 3 + round_index) % 220 + 220) % 220
$$;

create function ranked_private.daily_projection(uid uuid) returns jsonb
language sql stable set search_path = '' as $$
 select jsonb_build_object(
  'profile',(select case when nickname is null then null else jsonb_build_object('nickname',nickname,'enrolled',enrolled) end from ranked_private.accounts where user_id=uid),
  'streak',(select jsonb_build_object('current',coalesce(current_streak,0),'best',coalesce(best_streak,0),'lastCompletedDate',last_completed_date)
    from (select uid u) x left join ranked_private.daily_streaks s on s.user_id=x.u),
  'daily',jsonb_build_object(
    'date',(clock_timestamp() at time zone 'utc')::date,
    'challengeNumber',ranked_private.daily_challenge_number((clock_timestamp() at time zone 'utc')::date),
    'rounds',(select coalesce(jsonb_agg(jsonb_build_object('roundIndex',r.round_index,'version',r.version,'playerId',r.player_id,
       'options',r.options,'guesses',to_jsonb(r.guesses),'hints',r.hints,
       'clueCountry',case when r.hints>=1 then p.country else null end,
       'cluePosition',case when r.hints>=2 then p.position else null end,
       'status',r.status,'points',r.points,'startedAt',r.started_at) order by r.round_index),'[]'::jsonb)
     from ranked_private.daily_rounds r join ranked_private.players p on p.id=r.player_id
     where r.user_id=uid and r.date=(clock_timestamp() at time zone 'utc')::date),
    'finished',(select count(*)=3 from ranked_private.daily_rounds where user_id=uid and date=(clock_timestamp() at time zone 'utc')::date and status<>'playing'))
 )
$$;

create function ranked_private.daily_streak_leaderboard(uid uuid, page_limit integer, page_offset integer) returns jsonb
language sql stable set search_path = '' as $$
 with scores as (
   select a.user_id,a.nickname,coalesce(s.current_streak,0) current_streak,coalesce(s.best_streak,0) best_streak
   from ranked_private.accounts a join ranked_private.daily_streaks s on s.user_id=a.user_id
   where a.enrolled and s.best_streak>0
 ), ranked as (select *,rank() over(order by current_streak desc,best_streak desc) as rank from scores),
 page as (select * from ranked order by current_streak desc,best_streak desc,lower(nickname),nickname limit page_limit offset page_offset)
 select jsonb_build_object(
  'entries',coalesce((select jsonb_agg(jsonb_build_object('nickname',nickname,'currentStreak',current_streak,'bestStreak',best_streak,'rank',rank) order by current_streak desc,best_streak desc,lower(nickname),nickname) from page),'[]'::jsonb),
  'own',(select jsonb_build_object('nickname',nickname,'currentStreak',current_streak,'bestStreak',best_streak,'rank',rank) from ranked where user_id=uid),
  'total',(select count(*) from ranked))
$$;

-- Full function body copied from 202609140006_ranked_ten_options_v2.sql
-- with: four new "daily*" actions added to the allowed-keys dispatch
-- (dailyProgress/dailyHint/dailyAnswer handled like start/hint/answer but
-- addressed by (uid,today,roundIndex) instead of a synthetic round id, and
-- dailyStreakLeaderboard handled in the same public/pre-auth branch as
-- leaderboard); everything else (progress/start/hint/answer/enroll,
-- leaderboard, idempotency, rate limiting, error shaping) is unchanged.
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
   today:=(clock_timestamp() at time zone 'utc')::date;
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
   if dr.status<>'playing' then dr.finished_at:=clock_timestamp(); end if;
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

-- Full function body copied from 202609140006_ranked_ten_options_v2.sql
-- with: the scores CTE folding in ranked_private.daily_results (tagged
-- implicitly by which table a row came from) via UNION ALL alongside the
-- existing ruleset='v2' results, so daily points sum into the same public
-- total and the same per-competition membership boards. UNION ALL, not
-- UNION, is required: the same account can legitimately earn two separate
-- scoring events for the same player_id (one ranked, one daily), and a
-- plain UNION would silently deduplicate them if the tuples happened to
-- coincide. The response shape (entries/own/total/competition, and each
-- entry's {nickname,points,answered,correct,rank}) is unchanged.
create or replace function ranked_private.leaderboard(uid uuid, competition_id text, page_limit integer, page_offset integer) returns jsonb
language sql stable set search_path = '' as $$
 with combined as (
   select user_id,player_id,points,correct from ranked_private.results where ruleset='v2'
   union all
   select user_id,player_id,points,correct from ranked_private.daily_results
 ), scores as (
   select a.user_id,a.nickname,coalesce(sum(c.points),0) points,count(c.player_id) answered,
     count(c.player_id) filter(where c.correct) correct
   from ranked_private.accounts a
   left join (combined c join ranked_private.memberships m on m.player_id=c.player_id and m.competition=competition_id)
     on c.user_id=a.user_id
   where a.enrolled group by a.user_id,a.nickname
   -- Enrollment alone is not a score; a verified loss (ranked or daily) still qualifies at zero points.
   having count(c.player_id)>0
 ), ranked as (select *,rank() over(order by points desc) as rank from scores),
 page as (select * from ranked order by points desc,lower(nickname),nickname limit page_limit offset page_offset)
 select jsonb_build_object('entries',coalesce((select jsonb_agg(jsonb_build_object('nickname',nickname,'points',points,'answered',answered,'correct',correct,'rank',rank) order by points desc,lower(nickname),nickname) from page),'[]'::jsonb),
 'own',(select jsonb_build_object('nickname',nickname,'points',points,'answered',answered,'correct',correct,'rank',rank) from ranked where user_id=uid),
 'total',(select count(*) from ranked),'competition',competition_id)
$$;

commit;
