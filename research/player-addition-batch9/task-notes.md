# Batch 9: fifty-player roster expansion

- Baseline commit: `35e2e4cf3a37ea22b8f9af7ed973991c2bef0e36`
- Baseline exporter: 110 playable players, 177 ranked candidates, 13,895 rivals, 377 memberships, 6 competitions.
- Requested addition: 50 playable careers.
- Selection balance: 25 European and 25 South American senior national-team identities, following the established balanced-batch convention.
- Candidate source: the existing 67-profile, two-domain researched wrong-answer bank. The 50 selected profiles are promotion candidates; all require playable-record re-audit before integration.
- Longlist: 150 candidates—the complete 67-profile bank plus 83 current playable records retained as explicit duplicate rejections. This keeps every selection and rejection reproducible without fabricating unresearched external leads.
- Post-promotion rival audit found sparse Swedish, Chilean, Uruguayan and Peruvian era cohorts. Fourteen independently sourced bank-only support profiles bring the final bank to 31 and the complete candidate universe to 191; they do not become playable rounds.
- Publication boundary: implementation does not authorize a hosted Supabase migration or deployment. A new forward migration may be prepared and tested locally; historical migrations remain immutable.

The generated shortlist lives at `candidate-shortlist.json` and is validated with:

```sh
node .agents/skills/derabona-player-addition/scripts/validate-shortlist.mjs research/player-addition-batch9/candidate-shortlist.json
```
