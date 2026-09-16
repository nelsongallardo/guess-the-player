# Player Record and Evidence Reference

Load this reference while creating or reviewing each playable record. Match the repository's current schema exactly; this document explains the required meaning rather than replacing live examples in `research/verified-players.json`.

## Playable record fields

```json
{
  "id": "stable-lowercase-slug",
  "name": "Display Name",
  "continent": "Europe or South America",
  "country": "Senior national team represented",
  "position": "Goalkeeper, Defender, Midfielder or Forward",
  "clubs": [
    {
      "name": "Displayed club identity",
      "years": "Verified playing span",
      "note": "Optional scope, overlap, loan, return or uncertainty note"
    }
  ],
  "sources": [
    {
      "url": "Exact retrieved public URL",
      "title": "Original source title"
    }
  ],
  "notes": "Overall chronology, exclusions and caveats",
  "status": "active",
  "verifiedAt": "YYYY-MM-DD",
  "competitions": ["canonical-competition-id"]
}
```

Use the exact current field vocabulary from neighboring records. Do not add a one-off role, continent or status label without updating the model and tests deliberately. The current status vocabulary is `active`, `retired`, `deceased` and `signing-announced`; the last is reserved for an explicitly qualified exceptional record and must not be presented as verified competitive play.

## Evidence ledger requirements

For every player, preserve:

- at least two independent domains;
- literal source URLs exactly as retrieved;
- literal excerpts long enough to support the claim;
- senior debut or first playing season;
- complete in-scope ordered club route;
- last playing year, retirement or current active evidence;
- broad playing role;
- evidence for reserve teams, loans, returns or exceptional appearances;
- explicit exclusions and unresolved conflicts.

A Wikipedia page and a mirror or translated copy are not independent domains in substance. Prefer a governing body, official club/league source, reputable reporting or a separate statistics database for corroboration.

## Timeline decisions

### Include

- Competitive professional senior first-team play
- Competitive reserve teams in the adult pyramid
- Loans with actual play
- Actual playing returns to a prior club
- Loan-to-permanent periods as one uninterrupted node
- Genuine competitive comebacks after retirement or hiatus

### Exclude

- Youth clubs
- National teams
- Coaching and ownership roles
- Closed reserve leagues outside the adult pyramid
- Training-only visits
- Unused registrations or signings with no established play
- Testimonials and publicity exhibitions
- Amateur post-retirement appearances
- Parent-club ownership-only intervals between loans

When an exceptional row is retained, use a visible qualification rather than silently treating it as ordinary league play.

## Bilingual alignment

The English and Spanish notes must encode the same facts and uncertainty. Translate explanation, not proper names, source titles or player identity. Keep club-note indexes aligned with the exact club array; a reordered club requires both languages to move together.

## Competition membership

Competition tags organize decks by high-confidence club membership. They are not claims that the player appeared in that competition during every tagged season. Use only canonical IDs already accepted by the model unless the task explicitly introduces a new competition.

## Origin and rival profile

For matching, derive:

- first displayed senior club;
- domestic football system for `ORIGIN_CLUBS`;
- senior debut year;
- final playing year or current endpoint;
- broad role and region;
- ordered club signature.

A valid playable addition must not share an identical ordered club signature with another playable player. It must retain at least four same-system peers with overlapping careers and an absolute debut-year difference of no more than eight years.

## Crest checklist

For every new club key:

- confirm the exact club identity;
- decide whether an existing alias is truly the same club;
- retrieve an authentic transparent crest;
- keep public source URL and attribution;
- decode and inspect at full resolution;
- optimize to the project's current size limit without changing unrelated assets;
- verify offline rendering.

## Per-player completion checklist

- [ ] Stable unique ID and display name
- [ ] Country, continent and broad position
- [ ] Full ordered in-scope clubs
- [ ] Years and aligned optional notes
- [ ] Current status vocabulary and career endpoint
- [ ] At least two independent domains
- [ ] Literal excerpts in curated evidence
- [ ] English and Spanish notes aligned
- [ ] Competition tags reviewed
- [ ] First club mapped in `ORIGIN_CLUBS`
- [ ] Unique ordered club signature
- [ ] Crest and attribution for every club
- [ ] Four eligible contemporary same-system rivals
- [ ] Promotion cleanup completed when applicable
