// Reply drafting. Runs ONLY on posts that already passed the code-level
// blocklist in scout.mjs — the model is never asked to judge whether a post
// is about a death, an injury or politics.
//
// Uses the Hermes CLI so there's no second API key to manage and no extra
// inference bill. Returns null rather than a bad draft.

import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const HERMES = process.env.HERMES_BIN || path.join(process.env.HOME, '.local/bin/hermes');

// The reply prompt carries the humanizer rules inline. These replies go out
// under the brand's name into football Twitter, where "sounds like a bot" is
// the failure mode that gets an account muted and blocked — and the block/
// report rate is what X actually measures. The banned constructions below are
// humanizer §1 (not X but Y), §2 (one-line closers, dramatic fragments),
// §3 (sayings that sound deep), §4 (staged run-up) and §8 (dashes).
const SYSTEM = `Sos hincha y manejás la cuenta de derabona, un juego para adivinar
al jugador por los clubes de su carrera. Cuenta de X: @derabona_club.

Escribí UNA respuesta a un post de fútbol.

Cómo tiene que sonar:
- Español rioplatense, de hincha hablando con otro hincha.
- 1 o 2 oraciones. Menos de 180 caracteres.
- Decí algo concreto: un dato de carrera, una opinión, una pregunta real.
- Si no tenés nada que aportar, respondé exactamente: SKIP

Nunca escribas así (suena a bot):
- "No es X, es Y" ni "no solo X, sino Y".
- Frases de cierre tipo "Así de simple", "Y eso es todo", "Impresionante".
- Frases que suenan profundas sin decir nada: "la realidad es que", "en el fondo".
- Arranques de relleno: "Mirá", "La verdad", "Che, posta", "Honestamente".
- Guiones largos (—). Usá comas o puntos.
- Hashtags, links, emojis decorativos, signos de exclamación múltiples.
- Saludos ("¡Hola!", "Buenas") ni elogios al autor ("¡Qué buen post!").

Reglas duras:
- NO inventes datos. Si no estás seguro de un club, una fecha o un número, no lo menciones.
- NO corrijas al autor con soberbia.
- NO menciones derabona salvo que te lo permitan explícitamente.

Devolvé SOLO el texto de la respuesta, sin comillas ni explicación.`;

// Belt and braces: the prompt asks for these to be avoided, but a model that
// ignores the prompt must not reach Nelson's approval queue. Returns the name
// of the first tell found, or null. Mirrors humanizer §1, §2, §3, §4, §8.
export function aiTell(text) {
  const t = text.toLowerCase();
  if (/\bno (es|se trata de|solo|sólo|solamente)\b[^.]*\b(sino|es)\b/.test(t)) return 'not-X-but-Y';
  if (/[—–]/.test(text)) return 'dash';
  if (/\b(la realidad es que|en el fondo|al final del día|la verdad es que|lo importante ac[áa])\b/.test(t)) return 'deep-sounding';
  // \b does not fire after an accented vowel in JS regex, so match the
  // separator explicitly rather than relying on a word boundary.
  if (/^(mir[áa]|che|posta|honestamente|la verdad|ojo|atenti)\s*[,.:!]?\s/.test(t)) return 'staged opener';
  if (/\b(as[íi] de simple|y eso es todo|ni m[áa]s ni menos|punto final)\b\.?$/.test(t.trim())) return 'closer';
  if (/!{2,}|\?{2,}/.test(text)) return 'punctuation spam';
  if (/^(hola|buenas|buen d[íi]a|qu[ée] buen post)\b/.test(t)) return 'greeting';
  return null;
}

export async function draftReply({ sourceText, handle, allowMention = false }) {
  const mention = allowMention
    ? 'Podés mencionar derabona al pasar, si encaja naturalmente. No es obligatorio.'
    : 'NO menciones derabona en esta respuesta.';

  const prompt = `${SYSTEM}\n\n${mention}\n\nPost de @${handle}:\n"""${sourceText}"""\n\nTu respuesta:`;

  try {
    const { stdout } = await run(HERMES, ['-z', prompt], {
      timeout: 90_000,
      maxBuffer: 1 << 20,
      env: { ...process.env, HERMES_QUIET: '1' },
    });
    let reply = (stdout || '').trim()
      .replace(/^["'`]+|["'`]+$/g, '')
      .split('\n').filter(Boolean).join(' ')
      .trim();

    if (!reply || /^SKIP$/i.test(reply)) return null;
    if (reply.length > 200) return null;
    if (/https?:\/\/|#\w/.test(reply)) return null;
    if (!allowMention && /derabona/i.test(reply)) return null;

    const tell = aiTell(reply);
    if (tell) {
      console.error(`  rejected draft for @${handle} (${tell}): ${reply.slice(0, 70)}`);
      return null;
    }
    return reply;
  } catch (e) {
    console.error(`  draft failed for @${handle}: ${e.message.slice(0, 120)}`);
    return null;
  }
}
