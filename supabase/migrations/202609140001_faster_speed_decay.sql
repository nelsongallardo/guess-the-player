-- Tightens the speed-decay window so a correct answer that took a genuine
-- outside lookup (another tab/device) can no longer out-score a fast, honest
-- guess: full value inside a 2s grace window (was 5s), decaying to a 25%
-- floor by 12s (was a 50% floor by 30s). Hint penalty and cap are unchanged.
-- ranked_private.points() is immutable/stable and used by no other object,
-- so create or replace in place rather than a drop/recreate.
begin;

create or replace function ranked_private.points(hints integer, elapsed_ms numeric) returns integer
language sql immutable set search_path = '' as $$
 select round(100 * (1 - 0.2 * least(2,greatest(0,hints))) *
   case when elapsed_ms <= 2000 then 1 when elapsed_ms >= 12000 then 0.25
     else 1 - 0.75 * (elapsed_ms - 2000) / 10000 end)::integer
$$;

commit;
