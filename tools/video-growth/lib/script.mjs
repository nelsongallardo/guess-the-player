// Grounded Spanish (voseo) script. The only facts available are the ordered
// clubs and the verified name; the validator rejects anything else before any
// paid narration. Any later LLM shortening must still pass validateScript.

const QUESTION = 'Mirá los clubes. ¿Quién es?';
const YT_CTA = 'Jugá más carreras en derabona.club';

export const LIMITS = Object.freeze({ tiktokCaption: 150, tiktokHashtags: 5, youtubeTitle: 100, youtubeDescription: 5000 });

export function buildScript(career, platform) {
  if (!['youtube', 'tiktok'].includes(platform)) throw new Error(`unknown platform ${platform}`);
  const youtube = platform === 'youtube';
  return {
    platform,
    clubs: career.clubs.map(c => c.name),
    narration: {
      question: QUESTION,
      answer: `Era ${career.name}.`,
      cta: youtube ? `${YT_CTA}.` : null,
    },
    onScreen: {
      prompt: '¿Quién es?',
      think: 'Pensalo…',
      answerLabel: 'Era',
      cta: youtube ? YT_CTA : null,
    },
    title: youtube ? '¿Quién es? Adiviná al futbolista por sus clubes #shorts' : null,
    caption: youtube
      ? `Mirá la carrera en orden, pensá tu respuesta y esperá el final.\n\n${YT_CTA}`
      : '¿Lo sacás antes de la respuesta? #futbol #adivinaeljugador',
  };
}

const fold = s => String(s ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const words = s => fold(s).match(/[a-z0-9]+/g) ?? [];

const UNSUPPORTED = /\d|t[ií]tulo|campe[oó]n|trofeo|\bgol(es)?\b|mill[oó]n|r[eé]cord|leyenda|\bmejor|hist[oó]ric|fichaje|transfer|pr[eé]stamo|debut|me acuerdo|recuerdo|[€$%]/i;
const DAILY = /\bhoy\b|diari[oa]|del d[ií]a|desaf[ií]o|today|daily/i;
const PROMO = /derabona|https?:|www\.|\.(club|com|net|org|io|app)\b|\bjuga\b|\bjugar\b|\blink\b|\bbio\b|descarga|segui|\bapp\b/;

export function validateScript(script, career) {
  const errors = [];
  const err = m => errors.push(m);
  const { platform, narration = {}, onScreen = {} } = script;
  if (!['youtube', 'tiktok'].includes(platform)) return [`unknown platform ${platform}`];

  const clubs = career.clubs.map(c => c.name);
  if (!Array.isArray(script.clubs) || script.clubs.length !== clubs.length || script.clubs.some((c, i) => c !== clubs[i])) {
    err('clubs must be the verified ordered career, repeat spells included');
  }
  if (narration.answer !== `Era ${career.name}.`) err('narration.answer must be exactly "Era <verified name>."');

  const preReveal = { 'narration.question': narration.question, 'onScreen.prompt': onScreen.prompt, 'onScreen.think': onScreen.think, title: script.title, caption: script.caption };
  const nameTokens = new Set(words(career.name).filter(w => w.length >= 3));
  for (const [field, text] of Object.entries(preReveal)) {
    if (fold(text).includes(fold(career.name)) || words(text).some(w => nameTokens.has(w))) err(`${field} reveals the answer before the reveal`);
  }

  const copy = { ...preReveal, 'narration.cta': narration.cta, 'onScreen.answerLabel': onScreen.answerLabel, 'onScreen.cta': onScreen.cta };
  for (const [field, text] of Object.entries(copy)) {
    if (text == null) continue;
    if (UNSUPPORTED.test(text)) err(`${field} contains an unsupported claim (numbers, honours, fees, records or memories)`);
    if (DAILY.test(text)) err(`${field} presents the video as today's Daily`);
    if (platform === 'tiktok' && PROMO.test(fold(text))) err(`${field}: TikTok copy must not carry brand, URL or call to action`);
  }

  if (platform === 'tiktok') {
    if (narration.cta !== null || onScreen.cta !== null) err('TikTok derivative must not have a call to action (narration.cta/onScreen.cta must be null)');
    if (script.title !== null) err('TikTok video posts have no title field; title must be null');
    if (typeof script.caption !== 'string' || script.caption.length > LIMITS.tiktokCaption) err(`TikTok caption must be at most ${LIMITS.tiktokCaption} characters`);
    if ((script.caption?.match(/#/g) ?? []).length > LIMITS.tiktokHashtags) err(`TikTok caption allows at most ${LIMITS.tiktokHashtags} hashtags`);
  } else {
    if (typeof script.title !== 'string' || !script.title.trim() || script.title.length > LIMITS.youtubeTitle) err(`YouTube title must be 1–${LIMITS.youtubeTitle} characters`);
    if (typeof script.caption !== 'string' || script.caption.length > LIMITS.youtubeDescription) err(`YouTube description must be at most ${LIMITS.youtubeDescription} characters`);
  }
  return errors;
}
