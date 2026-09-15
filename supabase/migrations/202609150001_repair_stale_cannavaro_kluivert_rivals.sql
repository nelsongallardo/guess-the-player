-- Repair: 202609140003_roster_sync_60_to_80.sql inserted rivals rows
-- computed while Fabio Cannavaro and Patrick Kluivert were still
-- DISTRACTOR_PROFILES bank-only candidates (empty "competitions": [],
-- similarity computed from that lighter-standard bank shape). The seventh
-- roster-expansion batch promoted both to the playable roster with real
-- clubs/competitions data (see research/data-policy.md's "Seventh
-- expansion" note and CAREER_SOURCES.md), which changes their similarity
-- inputs. 202609130002_ranked_roster.sql was regenerated in place (this
-- project's established pattern for that frozen-ruleset export file, see
-- its own header) and no longer produces these 40 specific directional
-- rivals rows at all under the current model; 202609140003's "on conflict
-- do nothing" inserts therefore land as fresh (non-conflicting) inserts of
-- now-stale data on a from-scratch replay, rather than being harmlessly
-- skipped - exactly the same failure mode 202609140005_repair_stale_
-- promoted_bank_rivals.sql already fixed once for Roberto Baggio, Sócrates
-- and Falcão.
--
-- This is a forward, additive-only repair (a delete of specifically
-- identified stale rows, not an edit to 202609140003's already-applied
-- content) per this project's stated policy against rewriting applied
-- migration history. Every deleted pair was diffed directly against
-- 202609130002_ranked_roster.sql's current rivals set: each one is present
-- in 202609140003 but absent from the fresh export, confirming it is
-- genuinely stale rather than a legitimate row this repair would
-- accidentally remove. No ranked_private.results row references these
-- rivals rows (rivals are a distractor-matching aid, not a foreign key
-- target of results), so no player-facing outcome is affected.
delete from ranked_private.rivals where (player_id, candidate_id) in (
  ('david-villa','fabio-cannavaro'),
  ('david-villa','patrick-kluivert'),
  ('alessandro-del-piero','fabio-cannavaro'),
  ('alessandro-del-piero','patrick-kluivert'),
  ('raul','fabio-cannavaro'),
  ('raul','patrick-kluivert'),
  ('michael-owen','fabio-cannavaro'),
  ('michael-owen','patrick-kluivert'),
  ('miroslav-klose','fabio-cannavaro'),
  ('miroslav-klose','patrick-kluivert'),
  ('diego-forlan','fabio-cannavaro'),
  ('diego-forlan','patrick-kluivert'),
  ('carlos-valderrama','fabio-cannavaro'),
  ('carlos-valderrama','patrick-kluivert'),
  ('roque-santa-cruz','fabio-cannavaro'),
  ('roque-santa-cruz','patrick-kluivert'),
  ('zico','fabio-cannavaro'),
  ('zico','patrick-kluivert'),
  ('romario','fabio-cannavaro'),
  ('romario','patrick-kluivert'),
  ('luis-figo','fabio-cannavaro'),
  ('luis-figo','patrick-kluivert'),
  ('philipp-lahm','fabio-cannavaro'),
  ('philipp-lahm','patrick-kluivert'),
  ('alessandro-nesta','fabio-cannavaro'),
  ('alessandro-nesta','patrick-kluivert'),
  ('david-silva','fabio-cannavaro'),
  ('david-silva','patrick-kluivert'),
  ('rio-ferdinand','fabio-cannavaro'),
  ('rio-ferdinand','patrick-kluivert'),
  ('marcelo','fabio-cannavaro'),
  ('marcelo','patrick-kluivert'),
  ('gonzalo-higuain','fabio-cannavaro'),
  ('gonzalo-higuain','patrick-kluivert'),
  ('fernando-redondo','fabio-cannavaro'),
  ('fernando-redondo','patrick-kluivert'),
  ('angel-di-maria','fabio-cannavaro'),
  ('angel-di-maria','patrick-kluivert'),
  ('juninho-pernambucano','fabio-cannavaro'),
  ('juninho-pernambucano','patrick-kluivert')
);
