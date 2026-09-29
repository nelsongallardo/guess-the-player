-- Match the public all-players leaderboard total in both private score projections.
-- Leave career-only seenPlayerIds/competitionCounts and Daily streak unchanged.
begin;

create or replace function ranked_private.projection(uid uuid, rid uuid default null) returns jsonb
language sql stable set search_path = '' as $$
 select jsonb_build_object(
 'profile',(select case when nickname is null then null else jsonb_build_object('nickname',nickname,'enrolled',enrolled,'nicknamePrompted',nickname_prompted) end from ranked_private.accounts where user_id=uid),
 'progress',jsonb_build_object(
   'totalPoints',coalesce((select sum(points) from ranked_private.results where user_id=uid and ruleset='v2'),0) + coalesce((select sum(points) from ranked_private.daily_results where user_id=uid),0),
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

-- Preserve the latest 202609280001_mandatory_nickname_prompt.sql definition,
-- including nicknamePrompted; add only the combined total.
create or replace function ranked_private.daily_projection(uid uuid) returns jsonb
language sql stable set search_path = '' as $$
 select jsonb_build_object(
  'profile',(select case when nickname is null then null else jsonb_build_object('nickname',nickname,'enrolled',enrolled,'nicknamePrompted',nickname_prompted) end from ranked_private.accounts where user_id=uid),
  'totalPoints',coalesce((select sum(points) from ranked_private.results where user_id=uid and ruleset='v2'),0) + coalesce((select sum(points) from ranked_private.daily_results where user_id=uid),0),
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

commit;
