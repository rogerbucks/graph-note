// The plain-language check of what the user reads (editor spec §41, ux_copy_auto). It scores each message's reading
// level, its longest sentence and the jargon in it, with no dependency. It also holds the limits a message must keep
// to. The messages themselves are gathered from every view by test/ux-copy.test.js. The ones that miss a limit for a
// reason are recorded in quality/copy.json. So a new miss, or a recorded one getting worse, fails.

/** The limits: a reading grade of 9 or lower (for a message long enough to have one), and sentences of 25 words or fewer. */
export const LIMITS = { grade: 9, sentenceWords: 25, gradedFrom: 10 };

/**
 * Words a reader should not meet, each with what to say instead. Matched as whole words, ignoring case unless the word is
 * written in capitals here. `developer` marks one allowed where the reader is reading or writing the graph's own text.
 */
export const JARGON = [
  { word: 'GQL', instead: 'the graph’s text', developer: true },
  { word: 'node', instead: 'thing' },
  { word: 'nodes', instead: 'things' },
  { word: 'edge', instead: 'link' },
  { word: 'edges', instead: 'links' },
  { word: 'vertex', instead: 'thing' },
  { word: 'schema', instead: 'kinds' },
  { word: 'parse', instead: 'read' },
  { word: 'parsed', instead: 'read' },
  { word: 'parser', instead: 'reader' },
  { word: 'payload', instead: 'what is sent' },
  { word: 'serialize', instead: 'write' },
  { word: 'serialise', instead: 'write' },
  { word: 'instantiate', instead: 'make' },
  { word: 'execute', instead: 'run' },
  { word: 'boolean', instead: 'yes or no' },
  { word: 'null', instead: 'nothing' },
  { word: 'undefined', instead: 'not set' },
  { word: 'NaN', instead: 'not a number' },
  { word: 'syntax', instead: 'how it is written' },
  { word: 'token', instead: 'word' },
  { word: 'utilise', instead: 'use' },
  { word: 'utilize', instead: 'use' },
  { word: 'leverage', instead: 'use' },
  { word: 'via', instead: 'through' },
  { word: 'e.g.', instead: 'for example' },
  { word: 'i.e.', instead: 'that is' },
  { word: 'etc.', instead: 'and so on' },
  { word: 'invalid', instead: 'not right, and why' },
  { word: 'error code', instead: 'what went wrong' },
  { word: 'profile', instead: 'how a graph is written' },
  { word: '§', instead: 'what to type' },
];

/** The sentences of `text`: split after . ! ? or a line break, with no empty ones. */
export function sentencesOf(text) {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => /[\p{L}\p{N}]/u.test(s));
}

/** The words of `text`: runs of letters, digits, apostrophes and hyphens. */
export const wordsOf = (text) => text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? [];

/** A word's syllables, by its vowel groups: the usual estimate, good enough for a reading grade. */
export function syllables(word) {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return 1; // a number or a symbol is read as one
  if (w.length <= 3) return 1;
  const groups = w
    .replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '')
    .replace(/^y/, '')
    .match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups?.length ?? 1);
}

/** The Flesch–Kincaid grade of `text`: the school year a reader needs to be in, by sentence length and word length. */
export function readingGrade(text) {
  const words = wordsOf(text),
    sentences = Math.max(1, sentencesOf(text).length);
  if (!words.length) return 0;
  const syl = words.reduce((n, w) => n + syllables(w), 0);
  return Math.round((0.39 * (words.length / sentences) + 11.8 * (syl / words.length) - 15.59) * 10) / 10;
}

/** The jargon in `text`, by its listed word; `developer` lets through the words allowed where the graph's text is read. */
export function jargonIn(text, { developer = false } = {}) {
  return JARGON.filter((j) => !(developer && j.developer))
    .filter((j) => {
      const escaped = j.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const caseless = j.word !== j.word.toUpperCase();
      // a whole word: no letter or digit next to an end that is one, so § is found in §3
      const edge = (c) => /[\p{L}\p{N}]/u.test(c);
      const before = edge(j.word[0]) ? '(?<![\\p{L}\\p{N}])' : '',
        after = edge(j.word.at(-1)) ? '(?![\\p{L}\\p{N}])' : '';
      return new RegExp(`${before}${escaped}${after}`, caseless ? 'iu' : 'u').test(text);
    })
    .map((j) => j.word);
}

/** The score of one message: its words, longest sentence, reading grade (null when too short to have one) and jargon. */
export function scoreOf(text, options = {}) {
  const words = wordsOf(text).length;
  const longest = Math.max(0, ...sentencesOf(text).map((s) => wordsOf(s).length));
  const grade = words >= LIMITS.gradedFrom ? readingGrade(text) : null;
  return { words, longest, grade, jargon: jargonIn(text, options) };
}

/** What in a score misses the limits, in words; nothing when it keeps to them all. */
export function missesOf(score) {
  const out = [];
  if (score.grade !== null && score.grade > LIMITS.grade)
    out.push(`reads at grade ${score.grade}, over ${LIMITS.grade}`);
  if (score.longest > LIMITS.sentenceWords)
    out.push(`a sentence of ${score.longest} words, over ${LIMITS.sentenceWords}`);
  for (const word of score.jargon) {
    const j = JARGON.find((x) => x.word === word);
    out.push(`says “${word}”: say “${j?.instead}”`);
  }
  return out;
}

/**
 * Whether a recorded reason covers `score`: the message scores no worse than when it was recorded, on every count. A
 * message that got worse needs its record raised, with a reason, the same as a new one.
 */
export function covers(recorded, score) {
  return (
    (score.grade === null || (recorded.grade ?? 0) >= score.grade) &&
    recorded.longest >= score.longest &&
    score.jargon.every((w) => (recorded.jargon ?? []).includes(w))
  );
}
