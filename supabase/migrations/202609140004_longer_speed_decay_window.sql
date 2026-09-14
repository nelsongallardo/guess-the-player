-- Doubles the speed-decay floor time from 12s to 24s (grace window and
-- floor value unchanged at 2s / 25%): real play showed 12s too tight to
-- actually read a 10-option career before the floor hit, given the whole
-- point of the earlier tightening (ADR 0009) was discouraging outside
-- lookups, not making honest, attentive play itself feel rushed. See
-- docs/adr/0011-longer-decay-window-and-guest-clock-persistence.md.
begin;

create or replace function ranked_private.points(hints integer, elapsed_ms numeric) returns integer
language sql immutable set search_path = '' as $$
 select round(100 * (1 - 0.2 * least(3,greatest(0,hints))) *
   case when elapsed_ms <= 2000 then 1 when elapsed_ms >= 24000 then 0.25
     else 1 - 0.75 * (elapsed_ms - 2000) / 22000 end)::integer
$$;

commit;
