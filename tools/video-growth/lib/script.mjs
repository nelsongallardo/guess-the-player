// Grounded Spanish (voseo) script. The only facts available are the ordered
// clubs and the verified name; the validator rejects anything else before any
// narration. Any later LLM shortening must still pass validateScript.
//
// Format (owner request 2026-10-12, "more engaging"): a spoken challenge hook,
// the career read club by club (each card appears as it is named), a comment
// prompt with a countdown, the reveal, and a derabona.club call to action on
// every platform.

const HOOK = 'Si sabés de fútbol, este lo sacás.';
const QUESTION = '¿Quién es? Comentá tu respuesta.';
const CTA = 'Jugá más carreras como esta en derabona.club';

export const LIMITS = Object.freeze({ tiktokCaption: 150, tiktokHashtags: 5, youtubeTitle: 100, youtubeDescription: 5000 });

// The career sentence is generated from the verified club list only. `starts`
// holds the code-point index where each club name begins, so the renderer can
// show each card exactly when it is spoken.
export function clubsLine(clubs) {
  let text = '';
  const starts = [];
  const MIDDLE = ['Pasó por ', 'Luego, ', 'Más tarde, '];
  let middle = 0;
  clubs.forEach((club, i) => {
    const seen = clubs.slice(0, i).includes(club);
    const last = i === clubs.length - 1;
    const lead = i === 0 ? 'Arrancó en ' : seen ? (last ? 'Y volvió a ' : 'Volvió a ') : last ? 'Y después, ' : MIDDLE[middle++ % MIDDLE.length];
    text += (i ? ' ' : '') + lead;
    starts.push([...text].length);
    text += `${club}.`;
  });
  return { text, starts };
}

export function buildScript(career, platform) {
  if (!['youtube', 'tiktok'].includes(platform)) throw new Error(`unknown platform ${platform}`);
  const youtube = platform === 'youtube';
  const clubs = career.clubs.map(c => c.name);
  return {
    platform,
    clubs,
    narration: {
      hook: HOOK,
      clubs: clubsLine(clubs).text,
      question: QUESTION,
      answer: `Era ${career.name}.`,
      cta: `${CTA}.`,
    },
    onScreen: {
      hook: HOOK,
      prompt: '¿Quién es?',
      think: 'Comentá tu respuesta',
      answerLabel: 'Era',
      cta: 'Jugá en derabona.club',
    },
    title: youtube ? '¿Quién es? Adiviná al futbolista por sus clubes #shorts' : null,
    caption: youtube
      ? `Mirá la carrera en orden, pensá tu respuesta y esperá el final.\n\n${CTA}`
      : '¿Lo sacás antes del final? Jugá en derabona.club #futbol #adivinaeljugador',
  };
}

const fold = s => String(s ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const words = s => fold(s).match(/[a-z0-9]+/g) ?? [];

const UNSUPPORTED = /\d|t[ií]tulo|campe[oó]n|trofeo|\bgol(es)?\b|mill[oó]n|r[eé]cord|leyenda|\bmejor|hist[oó]ric|fichaje|transfer|pr[eé]stamo|debut|me acuerdo|recuerdo|[€$%]/i;
const DAILY = /\bhoy\b|diari[oa]|del d[ií]a|desaf[ií]o|today|daily/i;
// The only link either platform may carry is derabona.club.
const FOREIGN_LINK = /https?:|www\.|\.(com|net|org|io|app)\b|\.club\b(?<!derabona\.club)/;

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
  // Club names may contain digits or honours words (Schalke 04): the career line is
  // checked by exact construction, not by the free-text claim filter.
  if (narration.clubs !== clubsLine(clubs).text) err('narration.clubs must be generated from the verified ordered clubs');

  const preReveal = { 'narration.hook': narration.hook, 'narration.clubs': narration.clubs, 'narration.question': narration.question, 'onScreen.hook': onScreen.hook, 'onScreen.prompt': onScreen.prompt, 'onScreen.think': onScreen.think, title: script.title, caption: script.caption };
  const nameTokens = new Set(words(career.name).filter(w => w.length >= 3));
  for (const [field, text] of Object.entries(preReveal)) {
    if (fold(text).includes(fold(career.name)) || words(text).some(w => nameTokens.has(w))) err(`${field} reveals the answer before the reveal`);
  }

  const { 'narration.clubs': _clubs, ...freeText } = preReveal;
  const copy = { ...freeText, 'narration.cta': narration.cta, 'onScreen.answerLabel': onScreen.answerLabel, 'onScreen.cta': onScreen.cta };
  for (const [field, text] of Object.entries(copy)) {
    if (text == null) continue;
    if (UNSUPPORTED.test(text)) err(`${field} contains an unsupported claim (numbers, honours, fees, records or memories)`);
    if (DAILY.test(text)) err(`${field} presents the video as today's Daily`);
    if (FOREIGN_LINK.test(fold(text))) err(`${field} links somewhere other than derabona.club`);
  }

  if (platform === 'tiktok') {
    if (script.title !== null) err('TikTok video posts have no title field; title must be null');
    if (typeof script.caption !== 'string' || script.caption.length > LIMITS.tiktokCaption) err(`TikTok caption must be at most ${LIMITS.tiktokCaption} characters`);
    if ((script.caption?.match(/#/g) ?? []).length > LIMITS.tiktokHashtags) err(`TikTok caption allows at most ${LIMITS.tiktokHashtags} hashtags`);
  } else {
    if (typeof script.title !== 'string' || !script.title.trim() || script.title.length > LIMITS.youtubeTitle) err(`YouTube title must be 1–${LIMITS.youtubeTitle} characters`);
    if (typeof script.caption !== 'string' || script.caption.length > LIMITS.youtubeDescription) err(`YouTube description must be at most ${LIMITS.youtubeDescription} characters`);
  }
  return errors;
}
