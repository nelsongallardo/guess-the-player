// Builds a tiny index.html with the same script-block shapes the real game uses.
// MOCK roster: fictional players, 1x1 PNG crests.

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

export function syntheticIndex({ players, scheduleIds, dropCrestFor = null }) {
  const crests = {};
  const roster = players.map(p => ({
    ...p,
    clubCrests: p.clubs.map((c, i) => {
      const ref = `https://crests.example.org/${encodeURIComponent(c.name)}.png`;
      if (p.id !== dropCrestFor) crests[ref] = { dataUrl: PNG, sourcePage: 'https://example.org' };
      return p.id === dropCrestFor ? `https://crests.example.org/missing-${i}.png` : ref;
    }),
  }));
  const schedule = scheduleIds.map(id => ({ payloadId: id, playerId: id }));
  return `<!doctype html><html><body>
<script id="roster-data">const PLAYERS = ${JSON.stringify(roster)};</script>
<script id="crest-data">const CREST_ASSETS = ${JSON.stringify(crests)};</script>
<script id="daily-challenge">
const DAILY_SCHEDULE_V1=dailyDeepFreeze(${JSON.stringify(schedule)});
const DAILY_SCHEDULE_V1_DIGEST="sha256-mock";
const DailyChallenge=(()=>{const EPOCH_DAY=Date.UTC(2026,8,17)/86400000;return {};})();
</script>
</body></html>`;
}

export function syntheticResearch(players) {
  return JSON.stringify(players.map(p => ({
    id: p.id, name: p.name, clubs: p.clubs,
    sources: p.sources ?? [{ url: `https://example.org/${p.id}`, title: 'mock' }],
  })));
}
