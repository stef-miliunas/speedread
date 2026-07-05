/** Core RSVP logic: tokenizing, optimal recognition point, display timing. */

/** Split raw text into display tokens (words). Collapses all whitespace. */
export function tokenize(text: string): string[] {
  return text.split(/\s+/).filter((w) => w.length > 0);
}

/** Group words into chunks of `size`, joined with a space. */
export function chunkify(words: string[], size: 1 | 2): string[] {
  if (size === 1) return words;
  const out: string[] = [];
  for (let i = 0; i < words.length; i += size) {
    out.push(words.slice(i, i + size).join(' '));
  }
  return out;
}

const LEADING_PUNCT = /^[^\p{L}\p{N}]*/u;
const TRAILING_PUNCT = /[^\p{L}\p{N}]*$/u;

/**
 * Optimal recognition point: the character the eye should land on.
 * Empirically this sits slightly left of center — around 30% into the
 * word. We use the standard length-bucketed formula (as popularized by
 * Spritz) computed over the alphanumeric core, then offset it past any
 * leading punctuation so quotes and brackets don't steal the fixation.
 */
export function orpIndex(token: string): number {
  const lead = token.match(LEADING_PUNCT)![0].length;
  const core = token.slice(lead).replace(TRAILING_PUNCT, '');
  const n = core.length;
  let k: number;
  if (n <= 1) k = 0;
  else if (n <= 5) k = 1;
  else if (n <= 9) k = 2;
  else if (n <= 13) k = 3;
  else k = 4;
  return Math.min(lead + k, Math.max(token.length - 1, 0));
}

const SENTENCE_END = /[.!?…]["'’”)\]»]*$/u;
const CLAUSE_END = /[,;:—–]["'’”)\]»]*$/u;

/**
 * Display duration for one chunk, in ms.
 * Base rate is 60000/wpm per word; sentence-ending punctuation holds the
 * word ~2.1x, clause punctuation ~1.5x, and long words get a small bonus
 * so they don't blur past.
 */
export function chunkDelay(chunk: string, wpm: number): number {
  const base = 60000 / wpm;
  const wordCount = chunk.split(' ').length;
  let factor = 1;
  if (SENTENCE_END.test(chunk)) factor = 2.1;
  else if (CLAUSE_END.test(chunk)) factor = 1.5;
  const coreLen = chunk.replace(/[^\p{L}\p{N}]/gu, '').length;
  if (coreLen >= 12) factor += 0.4;
  else if (coreLen >= 8) factor += 0.2;
  return base * wordCount * factor;
}

/** Number of chunks the resume ramp spans. */
export const RAMP_CHUNKS = 5;

/**
 * Speed multiplier while resuming: 20% slower for the first RAMP_CHUNKS
 * chunks, then a linear ramp back up to full speed over the next few.
 */
export function rampSpeed(chunksSincePlay: number): number {
  if (chunksSincePlay < RAMP_CHUNKS) return 0.8;
  const t = (chunksSincePlay - RAMP_CHUNKS) / RAMP_CHUNKS;
  return Math.min(1, 0.8 + 0.2 * t);
}
