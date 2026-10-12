// Captions derived only from returned character alignment. Missing or
// inconsistent timing throws; nothing is estimated.

export function validateAlignment(text, alignment) {
  if (!alignment || typeof alignment !== 'object') throw new Error('alignment is missing');
  const { characters: c, character_start_times_seconds: s, character_end_times_seconds: e } = alignment;
  if (![c, s, e].every(Array.isArray)) throw new Error('alignment arrays are missing');
  if (c.length !== s.length || c.length !== e.length) throw new Error('alignment arrays differ in length');
  if (c.join('') !== text) throw new Error('alignment characters do not match the requested text');
  for (let i = 0; i < c.length; i++) {
    if (!Number.isFinite(s[i]) || !Number.isFinite(e[i]) || s[i] < 0) throw new Error(`alignment time ${i} is not a finite non-negative number`);
    if (e[i] < s[i]) throw new Error(`alignment end precedes start at ${i}`);
    if (i && s[i] < s[i - 1]) throw new Error(`alignment start times are not monotonic at ${i}`);
  }
  return true;
}

const ms = x => Math.round(x * 1000) / 1000;

export function wordsFromAlignment(text, alignment, offsetSec) {
  validateAlignment(text, alignment);
  const words = [];
  let cur = null;
  [...text].forEach((ch, i) => {
    if (/\s/.test(ch)) { cur = null; return; }
    if (!cur) { cur = { text: '', start: alignment.character_start_times_seconds[i], end: 0 }; words.push(cur); }
    cur.text += ch;
    cur.end = alignment.character_end_times_seconds[i];
  });
  return words.map(w => ({ text: w.text, start: ms(w.start + offsetSec), end: ms(w.end + offsetSec) }));
}

export function buildCues(words, { maxCharsPerLine = 24, maxLines = 2 } = {}) {
  const cues = [];
  let cue = null;
  for (const w of words) {
    if (w.text.length > maxCharsPerLine) throw new Error(`word "${w.text}" does not fit a ${maxCharsPerLine}-character line`);
    if (!cue) { cue = { start: w.start, end: w.end, lines: [w.text] }; cues.push(cue); continue; }
    const last = cue.lines.length - 1;
    if (cue.lines[last].length + 1 + w.text.length <= maxCharsPerLine) cue.lines[last] += ` ${w.text}`;
    else if (cue.lines.length < maxLines) cue.lines.push(w.text);
    else { cue = { start: w.start, end: w.end, lines: [w.text] }; cues.push(cue); continue; }
    cue.end = w.end;
  }
  return cues;
}

const stamp = sec => {
  const t = Math.round(sec * 1000);
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(Math.floor(t / 3600000))}:${p(Math.floor(t / 60000) % 60)}:${p(Math.floor(t / 1000) % 60)},${p(t % 1000, 3)}`;
};

export function toSrt(cues) {
  return cues.map((c, i) => `${i + 1}\n${stamp(c.start)} --> ${stamp(c.end)}\n${c.lines.join('\n')}\n`).join('\n');
}
