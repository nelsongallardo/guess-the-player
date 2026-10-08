-- Play orientation must not start a scoring clock. Overview reads gameplay;
-- only the existing account initialization and per-account rate budget write.
-- Legacy actions retain their exact dispatcher, receipts and start semantics.
begin;

create function ranked_private.play_overview(uid uuid, today date) returns jsonb
language sql stable set search_path = '' as $$
 with current_daily as (
   select count(*) completed,coalesce(sum(points),0) points,count(*) filter(where correct) correct
   from ranked_private.daily_results where user_id=uid and date=today
 ), previous_daily as (
   select date,sum(points) points,count(*) filter(where correct) correct
   from ranked_private.daily_results where user_id=uid and date<today
   group by date having count(*)=3 order by date desc limit 1
 ), current_career as (
   select status,competition from ranked_private.rounds where user_id=uid
   order by (status='playing') desc,started_at desc,id limit 1
 )
 select (ranked_private.projection(uid)-'round') || jsonb_build_object(
   'daily',jsonb_build_object(
     'date',today,
     'status',case when d.completed=3 then 'finished'
       when exists(select 1 from ranked_private.daily_rounds where user_id=uid and date=today) then 'playing'
       else 'ready' end,
     'completed',d.completed,'totalPoints',d.points,'correctCount',d.correct,
     'previous',(select jsonb_build_object('date',date,'totalPoints',points,'correctCount',correct) from previous_daily)),
   'career',jsonb_build_object(
     'status',case when c.status='playing' then 'playing'
       when c.competition is not null and not exists(
         select 1 from ranked_private.memberships m where m.competition=c.competition
         and not exists(select 1 from ranked_private.results r
           where r.user_id=uid and r.player_id=m.player_id and r.ruleset='v2')
       ) then 'completed'
       when c.status is not null then 'resolved' else 'ready' end,
     'competition',c.competition))
 from current_daily d left join current_career c on true
$$;
revoke all on function ranked_private.play_overview(uuid,date) from public,anon,authenticated,service_role;

-- Keep the established mutations intact instead of duplicating scoring,
-- idempotency, stale-round handling and private-league cutoff locking.
alter function public.ranked_game(uuid,jsonb) rename to ranked_game_before_overview;
alter function public.ranked_game_before_overview(uuid,jsonb) set schema ranked_private;
revoke all on function ranked_private.ranked_game_before_overview(uuid,jsonb) from public,anon,authenticated,service_role;

create function public.ranked_game(verified_user_id uuid, request jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
 uid uuid := verified_user_id;
 now_value timestamptz;
 n integer;
begin
 if request->>'action' is distinct from 'overview' then
   return ranked_private.ranked_game_before_overview(verified_user_id,request);
 end if;
 if jsonb_typeof(request) <> 'object'
   or exists(select 1 from jsonb_object_keys(request) key where key<>'action') then
   raise exception 'INVALID_REQUEST';
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
 return ranked_private.play_overview(uid,(now_value at time zone 'utc')::date);
end
$$;
revoke all on function public.ranked_game(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.ranked_game(uuid,jsonb) to service_role;

commit;
