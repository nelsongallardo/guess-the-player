// On-demand Daily email card, rendered from the local index.html. Fetches the
// pinned font and the og_edge renderer from the network on first use.
import { cardHandler, dailySlot, parseSite } from '../supabase/functions/_shared/daily-card.ts';
const html = await Deno.readTextFile(new URL('../index.html', import.meta.url));
function equal(a: unknown, b: unknown) { if (JSON.stringify(a) !== JSON.stringify(b)) throw Error(`${JSON.stringify(a)} != ${JSON.stringify(b)}`); }

Deno.test('the card follows the game Daily schedule and never reveals a future day', async () => {
  const site = parseSite(html);
  // Same arithmetic as DailyChallenge.forDate / ranked_private.daily_slot_index.
  equal(dailySlot('2026-09-17', site.schedule.length), { challengeNumber: 1, slot: 0 });
  equal(dailySlot('2026-10-10', 220), { challengeNumber: 24, slot: 69 });
  const run = cardHandler({ fetchSite: async () => html, now: () => Date.parse('2026-10-10T16:00:00Z') });
  const today = await run(new Request('https://x/daily-card?date=2026-10-10'));
  equal([today.status, today.headers.get('content-type')], [200, 'image/png']);
  const png = new Uint8Array(await today.arrayBuffer());
  equal([...png.slice(1, 4)], [80, 78, 71]);
  for (const date of ['2026-10-11', '2027-01-01', '2026-09-16', 'tomorrow'])
    equal([date, (await run(new Request(`https://x/daily-card?date=${date}`))).status], [date, 404]);
  equal((await run(new Request('https://x/daily-card', { method: 'POST' }))).status, 405);
});
