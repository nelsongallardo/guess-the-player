-- Repair: 202609140003_roster_sync_60_to_80.sql inserted rivals rows
-- computed while Michael Ballack, Bastian Schweinsteiger, Marco van
-- Basten, Jorge Valdano, Ramón Díaz, Careca, Toninho Cerezo, Rui Costa
-- and Djalma Santos were still DISTRACTOR_PROFILES bank-only candidates
-- (empty "competitions": [], similarity computed from that
-- lighter-standard bank shape; van Basten never appears as a candidate
-- in 202609140003 at all, since he was researched after that migration
-- was written). The eighth roster-expansion batch promoted eight of
-- these nine to the playable roster with real clubs/competitions data
-- (see research/data-policy.md's "Eighth expansion" note and
-- CAREER_SOURCES.md; Gianluca Vialli was promoted in their place instead
-- of Franco Baresi, who never appeared as a candidate in
-- 202609140003 either and so needs no repair here), which changes their
-- similarity inputs and moves them out of the bank slice entirely.
-- 202609130002_ranked_roster.sql was regenerated in place (this
-- project's established pattern for that frozen-ruleset export file, see
-- its own header) and no longer produces these 154 specific directional
-- rivals rows at all under the current model; 202609140003's "on
-- conflict do nothing" inserts therefore land as fresh (non-conflicting)
-- inserts of now-stale data on a from-scratch replay, rather than being
-- harmlessly skipped - exactly the same failure mode
-- 202609140005_repair_stale_promoted_bank_rivals.sql and
-- 202609150001_repair_stale_cannavaro_kluivert_rivals.sql already fixed
-- for earlier promoted-from-bank batches.
--
-- This is a forward, additive-only repair (a delete of specifically
-- identified stale rows, not an edit to 202609140003's already-applied
-- content) per this project's stated policy against rewriting applied
-- migration history. Every deleted pair was diffed directly against
-- 202609130002_ranked_roster.sql's current rivals set: each one is
-- present in 202609140003 but absent from the fresh export, confirming
-- it is genuinely stale rather than a legitimate row this repair would
-- accidentally remove. No ranked_private.results row references these
-- rivals rows (rivals are a distractor-matching aid, not a foreign key
-- target of results), so no player-facing outcome is affected.
delete from ranked_private.rivals where (player_id, candidate_id) in (
  ('david-villa','jorge-valdano'),
  ('david-villa','ramon-diaz'),
  ('david-villa','djalma-santos'),
  ('david-villa','michael-ballack'),
  ('david-villa','bastian-schweinsteiger'),
  ('david-villa','careca'),
  ('david-villa','toninho-cerezo'),
  ('david-villa','rui-costa'),
  ('alessandro-del-piero','jorge-valdano'),
  ('alessandro-del-piero','ramon-diaz'),
  ('alessandro-del-piero','djalma-santos'),
  ('alessandro-del-piero','michael-ballack'),
  ('alessandro-del-piero','bastian-schweinsteiger'),
  ('alessandro-del-piero','careca'),
  ('alessandro-del-piero','toninho-cerezo'),
  ('alessandro-del-piero','rui-costa'),
  ('raul','jorge-valdano'),
  ('raul','ramon-diaz'),
  ('raul','djalma-santos'),
  ('raul','michael-ballack'),
  ('raul','bastian-schweinsteiger'),
  ('raul','careca'),
  ('raul','toninho-cerezo'),
  ('raul','rui-costa'),
  ('michael-owen','jorge-valdano'),
  ('michael-owen','ramon-diaz'),
  ('michael-owen','djalma-santos'),
  ('michael-owen','michael-ballack'),
  ('michael-owen','bastian-schweinsteiger'),
  ('michael-owen','careca'),
  ('michael-owen','toninho-cerezo'),
  ('michael-owen','rui-costa'),
  ('miroslav-klose','jorge-valdano'),
  ('miroslav-klose','ramon-diaz'),
  ('miroslav-klose','djalma-santos'),
  ('miroslav-klose','careca'),
  ('miroslav-klose','toninho-cerezo'),
  ('miroslav-klose','rui-costa'),
  ('diego-forlan','jorge-valdano'),
  ('diego-forlan','ramon-diaz'),
  ('diego-forlan','djalma-santos'),
  ('diego-forlan','michael-ballack'),
  ('diego-forlan','bastian-schweinsteiger'),
  ('diego-forlan','careca'),
  ('diego-forlan','toninho-cerezo'),
  ('diego-forlan','rui-costa'),
  ('carlos-valderrama','jorge-valdano'),
  ('carlos-valderrama','ramon-diaz'),
  ('carlos-valderrama','djalma-santos'),
  ('carlos-valderrama','michael-ballack'),
  ('carlos-valderrama','bastian-schweinsteiger'),
  ('carlos-valderrama','careca'),
  ('carlos-valderrama','toninho-cerezo'),
  ('carlos-valderrama','rui-costa'),
  ('roque-santa-cruz','jorge-valdano'),
  ('roque-santa-cruz','ramon-diaz'),
  ('roque-santa-cruz','djalma-santos'),
  ('roque-santa-cruz','michael-ballack'),
  ('roque-santa-cruz','bastian-schweinsteiger'),
  ('roque-santa-cruz','careca'),
  ('roque-santa-cruz','toninho-cerezo'),
  ('roque-santa-cruz','rui-costa'),
  ('zico','jorge-valdano'),
  ('zico','ramon-diaz'),
  ('zico','djalma-santos'),
  ('zico','michael-ballack'),
  ('zico','bastian-schweinsteiger'),
  ('zico','careca'),
  ('zico','toninho-cerezo'),
  ('zico','rui-costa'),
  ('romario','jorge-valdano'),
  ('romario','ramon-diaz'),
  ('romario','djalma-santos'),
  ('romario','michael-ballack'),
  ('romario','bastian-schweinsteiger'),
  ('romario','careca'),
  ('romario','toninho-cerezo'),
  ('romario','rui-costa'),
  ('luis-figo','jorge-valdano'),
  ('luis-figo','ramon-diaz'),
  ('luis-figo','djalma-santos'),
  ('luis-figo','michael-ballack'),
  ('luis-figo','bastian-schweinsteiger'),
  ('luis-figo','careca'),
  ('luis-figo','toninho-cerezo'),
  ('philipp-lahm','jorge-valdano'),
  ('philipp-lahm','ramon-diaz'),
  ('philipp-lahm','djalma-santos'),
  ('philipp-lahm','careca'),
  ('philipp-lahm','toninho-cerezo'),
  ('philipp-lahm','rui-costa'),
  ('alessandro-nesta','jorge-valdano'),
  ('alessandro-nesta','ramon-diaz'),
  ('alessandro-nesta','djalma-santos'),
  ('alessandro-nesta','michael-ballack'),
  ('alessandro-nesta','bastian-schweinsteiger'),
  ('alessandro-nesta','careca'),
  ('alessandro-nesta','toninho-cerezo'),
  ('alessandro-nesta','rui-costa'),
  ('david-silva','jorge-valdano'),
  ('david-silva','ramon-diaz'),
  ('david-silva','djalma-santos'),
  ('david-silva','michael-ballack'),
  ('david-silva','bastian-schweinsteiger'),
  ('david-silva','careca'),
  ('david-silva','toninho-cerezo'),
  ('david-silva','rui-costa'),
  ('rio-ferdinand','jorge-valdano'),
  ('rio-ferdinand','ramon-diaz'),
  ('rio-ferdinand','djalma-santos'),
  ('rio-ferdinand','michael-ballack'),
  ('rio-ferdinand','bastian-schweinsteiger'),
  ('rio-ferdinand','careca'),
  ('rio-ferdinand','toninho-cerezo'),
  ('rio-ferdinand','rui-costa'),
  ('marcelo','jorge-valdano'),
  ('marcelo','ramon-diaz'),
  ('marcelo','djalma-santos'),
  ('marcelo','michael-ballack'),
  ('marcelo','bastian-schweinsteiger'),
  ('marcelo','careca'),
  ('marcelo','toninho-cerezo'),
  ('marcelo','rui-costa'),
  ('gonzalo-higuain','jorge-valdano'),
  ('gonzalo-higuain','ramon-diaz'),
  ('gonzalo-higuain','djalma-santos'),
  ('gonzalo-higuain','michael-ballack'),
  ('gonzalo-higuain','bastian-schweinsteiger'),
  ('gonzalo-higuain','careca'),
  ('gonzalo-higuain','toninho-cerezo'),
  ('gonzalo-higuain','rui-costa'),
  ('fernando-redondo','jorge-valdano'),
  ('fernando-redondo','djalma-santos'),
  ('fernando-redondo','michael-ballack'),
  ('fernando-redondo','bastian-schweinsteiger'),
  ('fernando-redondo','careca'),
  ('fernando-redondo','toninho-cerezo'),
  ('fernando-redondo','rui-costa'),
  ('angel-di-maria','jorge-valdano'),
  ('angel-di-maria','ramon-diaz'),
  ('angel-di-maria','djalma-santos'),
  ('angel-di-maria','michael-ballack'),
  ('angel-di-maria','bastian-schweinsteiger'),
  ('angel-di-maria','careca'),
  ('angel-di-maria','toninho-cerezo'),
  ('angel-di-maria','rui-costa'),
  ('juninho-pernambucano','jorge-valdano'),
  ('juninho-pernambucano','ramon-diaz'),
  ('juninho-pernambucano','djalma-santos'),
  ('juninho-pernambucano','michael-ballack'),
  ('juninho-pernambucano','bastian-schweinsteiger'),
  ('juninho-pernambucano','careca'),
  ('juninho-pernambucano','toninho-cerezo'),
  ('juninho-pernambucano','rui-costa')
);
