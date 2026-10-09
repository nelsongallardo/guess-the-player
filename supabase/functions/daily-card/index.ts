import { cardHandler } from '../_shared/daily-card.ts';
// Reads the deployed game, so the card always matches what players see.
Deno.serve(cardHandler({ fetchSite: async () => {
  const response = await fetch(Deno.env.get('DAILY_CARD_SITE_URL') ?? 'https://derabona.club/index.html');
  if (!response.ok) throw Error('SITE_UNAVAILABLE');
  return await response.text();
} }));
