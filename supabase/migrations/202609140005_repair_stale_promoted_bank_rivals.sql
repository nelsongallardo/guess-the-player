-- Repair: 202609140003_roster_sync_60_to_80.sql inserted rivals rows
-- computed while Roberto Baggio, Sócrates and Falcão were still
-- DISTRACTOR_PROFILES bank-only candidates (empty "competitions": [],
-- similarity computed from that lighter-standard bank shape). The sixth
-- roster-expansion batch promoted all three to the playable roster with
-- real clubs/competitions data (see research/data-policy.md's "Sixth
-- expansion" note and CAREER_SOURCES.md), which changes their similarity
-- inputs. 202609130002_ranked_roster.sql was regenerated in place (this
-- project's established pattern for that frozen-ruleset export file, see
-- its own header) and no longer produces these 58 specific directional
-- rivals rows at all under the current model; 202609140003's "on conflict
-- do nothing" inserts therefore land as fresh (non-conflicting) inserts of
-- now-stale data on a from-scratch replay, rather than being harmlessly
-- skipped.
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
  ('david-villa','roberto-baggio'),
  ('david-villa','socrates'),
  ('david-villa','paulo-roberto-falcao'),
  ('alessandro-del-piero','roberto-baggio'),
  ('alessandro-del-piero','socrates'),
  ('alessandro-del-piero','paulo-roberto-falcao'),
  ('raul','roberto-baggio'),
  ('raul','socrates'),
  ('raul','paulo-roberto-falcao'),
  ('michael-owen','roberto-baggio'),
  ('michael-owen','socrates'),
  ('michael-owen','paulo-roberto-falcao'),
  ('miroslav-klose','roberto-baggio'),
  ('miroslav-klose','socrates'),
  ('miroslav-klose','paulo-roberto-falcao'),
  ('diego-forlan','roberto-baggio'),
  ('diego-forlan','socrates'),
  ('diego-forlan','paulo-roberto-falcao'),
  ('carlos-valderrama','roberto-baggio'),
  ('carlos-valderrama','socrates'),
  ('carlos-valderrama','paulo-roberto-falcao'),
  ('roque-santa-cruz','roberto-baggio'),
  ('roque-santa-cruz','socrates'),
  ('roque-santa-cruz','paulo-roberto-falcao'),
  ('zico','roberto-baggio'),
  ('romario','roberto-baggio'),
  ('romario','socrates'),
  ('romario','paulo-roberto-falcao'),
  ('luis-figo','roberto-baggio'),
  ('luis-figo','socrates'),
  ('luis-figo','paulo-roberto-falcao'),
  ('philipp-lahm','roberto-baggio'),
  ('philipp-lahm','socrates'),
  ('philipp-lahm','paulo-roberto-falcao'),
  ('alessandro-nesta','roberto-baggio'),
  ('alessandro-nesta','socrates'),
  ('alessandro-nesta','paulo-roberto-falcao'),
  ('david-silva','roberto-baggio'),
  ('david-silva','socrates'),
  ('david-silva','paulo-roberto-falcao'),
  ('rio-ferdinand','roberto-baggio'),
  ('rio-ferdinand','socrates'),
  ('rio-ferdinand','paulo-roberto-falcao'),
  ('marcelo','roberto-baggio'),
  ('marcelo','socrates'),
  ('marcelo','paulo-roberto-falcao'),
  ('gonzalo-higuain','roberto-baggio'),
  ('gonzalo-higuain','socrates'),
  ('gonzalo-higuain','paulo-roberto-falcao'),
  ('fernando-redondo','roberto-baggio'),
  ('fernando-redondo','socrates'),
  ('fernando-redondo','paulo-roberto-falcao'),
  ('angel-di-maria','roberto-baggio'),
  ('angel-di-maria','socrates'),
  ('angel-di-maria','paulo-roberto-falcao'),
  ('juninho-pernambucano','roberto-baggio'),
  ('juninho-pernambucano','socrates'),
  ('juninho-pernambucano','paulo-roberto-falcao')
);
