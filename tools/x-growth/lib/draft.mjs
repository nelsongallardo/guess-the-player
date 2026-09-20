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

const SYSTEM = `Sos el community manager de derabona, un juego donde se adivina
al futbolista por los clubes de su carrera. Cuenta de X: @derabona_club.

Escribí UNA respuesta a un post de fútbol. Reglas estrictas:
- Español rioplatense, natural, de hincha. Nada de marketing.
- 1 o 2 oraciones. Menos de 180 caracteres.
- Aportá algo: un dato de carrera, una opinión, una pregunta genuina.
- NO uses links. NO uses hashtags. NO saludes ("¡Hola!", "Buenas").
- NO contradigas ni corrijas con soberbia al autor.
- NO inventes datos: si no estás seguro de un club, una fecha o un número, no lo menciones.
- NO menciones derabona salvo que te lo permitan explícitamente.
- Si el post no da para una respuesta futbolera honesta, respondé exactamente: SKIP

Devolvé SOLO el texto de la respuesta, sin comillas ni explicación.`;

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
    return reply;
  } catch (e) {
    console.error(`  draft failed for @${handle}: ${e.message.slice(0, 120)}`);
    return null;
  }
}
