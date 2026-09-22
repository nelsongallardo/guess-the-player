// Telegram sender. Always addresses an explicit thread_id — a bare send
// makes Telegram auto-create a new topic in Nelson's forum DM every time.

const CHAT_ID = process.env.DERABONA_TG_CHAT;
const THREAD_ID = process.env.DERABONA_TG_THREAD;

export async function sendTelegram(text) {
  if (!CHAT_ID || !/^\d+$/.test(THREAD_ID || '')) throw new Error('explicit Telegram route required');
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN not set');
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    signal: AbortSignal.timeout(15000),
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: CHAT_ID,
      message_thread_id: Number(THREAD_ID),
      text,
      disable_web_page_preview: true,
    }),
  });
  const body = await res.json();
  if (!body.ok) throw new Error(`telegram send failed: ${JSON.stringify(body).slice(0, 200)}`);
  return body.result;
}
