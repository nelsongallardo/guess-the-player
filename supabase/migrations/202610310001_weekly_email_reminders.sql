-- Weekly email reminders (ADR 0030 amendment, 2026-10-31).
--
-- The owner reduced reminder frequency from daily to once a week so
-- subscribers do not tire of them. Every other rule is unchanged: the same
-- send window, the same completed-Daily skip, at most one attempted dispatch
-- per destination and UTC date, and missed weeks are never backfilled.
--
--   * send_isodow - the one UTC weekday (ISO: 1 = Monday ... 7 = Sunday) on
--     which in_window() can be true. The owner chose Sunday. claimDispatch,
--     startDispatch and previewDispatch all read in_window(), so no other
--     function changes.
--   * min_gap_seconds - raised from 24h + 2 min to 6 days. The weekday alone
--     already spaces sends a week apart; the gap also holds if send_isodow is
--     changed mid-week, so a weekday change can never cause two emails within
--     six days. It stays well under a week, so the weekly send never drifts.
--   * consent_versions - adds the weekly wording. The daily version stays
--     accepted for pages cached before this release; those subscribers get
--     fewer emails than the wording they saw, never more.
begin;

alter table reminder_private.settings
  add column send_isodow integer not null default 7 check(send_isodow between 1 and 7);

alter table reminder_private.settings alter column min_gap_seconds set default 518400;
alter table reminder_private.settings alter column consent_versions set default array['weekly-v1-20261031','daily-v1-20261009'];

update reminder_private.settings set
  min_gap_seconds=greatest(min_gap_seconds,518400),
  consent_versions=case when 'weekly-v1-20261031'=any(consent_versions) then consent_versions
    else array['weekly-v1-20261031']||consent_versions end,
  updated_at=clock_timestamp();

create or replace function reminder_private.in_window(now_value timestamptz) returns boolean
language sql stable set search_path = '' as $$
 select extract(isodow from now_value at time zone 'utc')::integer = s.send_isodow
   and ((extract(hour from now_value at time zone 'utc')*60 + extract(minute from now_value at time zone 'utc'))::integer)
   between s.window_start_minute and s.window_end_minute-1
 from reminder_private.settings s
$$;
revoke all on function reminder_private.in_window(timestamptz) from public, anon, authenticated, service_role;

commit;
