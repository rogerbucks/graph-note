// The plain-language check of every document and code comment (spec §41, plain_docs_auto). It is written for a
// reader with ADHD, who should be able to scan any page.
//
// A document keeps each sentence to 25 words and each paragraph to 80. It has a heading at least every 400 words. It
// uses none of the filler words below. A page for people using the app also reads at grade 9 or lower.
//
// A comment keeps each sentence to 25 words and uses no filler words.
//
// Misses that were there when the check came in are counted in quality/plain-docs.json, one count for each file. A
// count may fall, never rise. A file the record does not list must have none.
//
// `node scripts/plain-docs.mjs` lists every miss. `--update` lowers the counts to what is there now. The messages
// inside the app have their own check (ux-copy).
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readingGrade, wordsOf } from './plain-english.mjs';

/** The limits a document or comment keeps to. */
export const DOC_LIMITS = { sentenceWords: 25, paragraphWords: 80, wordsPerHeading: 400, readerGrade: 9 };

/** Filler words and phrases, each with what to write instead. Matched as whole words, ignoring case. */
export const FILLER = [
  { word: 'e.g.', instead: 'for example' },
  { word: 'i.e.', instead: 'that is' },
  { word: 'etc.', instead: 'and so on, or name them' },
  { word: 'via', instead: 'through' },
  { word: 'utilise', instead: 'use' },
  { word: 'utilize', instead: 'use' },
  { word: 'leverage', instead: 'use' },
  { word: 'in order to', instead: 'to' },
  { word: 'prior to', instead: 'before' },
  { word: 'subsequently', instead: 'then' },
  { word: 'commence', instead: 'start' },
  { word: 'facilitate', instead: 'help' },
  { word: 'aforementioned', instead: 'this' },
  { word: 'henceforth', instead: 'from now on' },
  { word: 'herein', instead: 'here' },
  { word: 'whilst', instead: 'while' },
  { word: 'thus', instead: 'so' },
  { word: 'hence', instead: 'so' },
  { word: 'simply', instead: 'leave it out' },
  { word: 'obviously', instead: 'leave it out' },
  { word: 'basically', instead: 'leave it out' },
  { word: 'respectively', instead: 'pair them up in turn' },
];

/** Pages written for people using the app, held to the reading grade too. */
export const READER_PAGES = /^(README\.md|wiki\/Home\.md|wiki\/How-to-use-[\w-]+\.md)$/;

/** The filler in `text`, by its listed word. */
export function fillerIn(text) {
  return FILLER.filter((f) => {
    const escaped = f.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+');
    return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'iu').test(text);
  }).map((f) => f.word);
}

/** The sentences of running text: split after . ! ? or : and a space, so a line break inside a sentence keeps it whole. */
export function sentencesIn(text) {
  return text
    .split(/(?<=[.!?:;])\s+(?=[^\p{Ll}])|(?<=[.!?])\s+/u)
    .map((s) => s.trim())
    .filter((s) => /[\p{L}\p{N}]/u.test(s));
}

/** Inline Markdown made into the words a reader sees: code as one word, links as their text, no markup or addresses. */
export function proseOf(text) {
  return text
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/`[^`]*`/g, 'code')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\*+|~~|(?<![\p{L}\p{N}])_+|_+(?![\p{L}\p{N}])/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The blocks of a Markdown document a reader meets: headings, paragraphs and list items, with the line each starts on.
 * Code blocks, tables, HTML comments and the lines a generated section fills are left out.
 */
export function blocksOf(markdown) {
  const lines = markdown.replace(/<!--[\s\S]*?-->/g, (c) => c.replace(/[^\n]/g, ' ')).split('\n');
  const blocks = [];
  let current = null,
    fence = null;
  const close = () => {
    if (current) blocks.push({ ...current, text: proseOf(current.text) });
    current = null;
  };
  lines.forEach((raw, i) => {
    const line = raw.trimEnd();
    const fenceMark = /^\s*(```+|~~~+)/.exec(line);
    if (fence) {
      if (fenceMark && fenceMark[1][0] === fence[0] && fenceMark[1].length >= fence.length) fence = null;
      return;
    }
    if (fenceMark) return (close(), (fence = fenceMark[1]));
    if (!line.trim() || /^\s*\|/.test(line) || /^\s*(-{3,}|\*{3,})\s*$/.test(line)) return close();
    if (/^#{1,6}\s/.test(line)) {
      close();
      blocks.push({ kind: 'heading', line: i + 1, text: proseOf(line.replace(/^#+\s*/, '')) });
      return;
    }
    if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) {
      close();
      current = { kind: 'item', line: i + 1, text: line.replace(/^\s*([-*+]|\d+[.)])\s+(\[[ x]\]\s+)?/, '') };
      return;
    }
    if (current) current.text += ` ${line.replace(/^\s*>\s?/, '')}`;
    else current = { kind: 'paragraph', line: i + 1, text: line.replace(/^\s*>\s?/, '') };
  });
  close();
  return blocks.filter((b) => b.text);
}

/** Every miss in a Markdown document, each with its line and what to do; `reader` adds the reading grade. */
export function documentMisses(markdown, { reader = false } = {}) {
  const out = [];
  const blocks = blocksOf(markdown);
  let sinceHeading = 0,
    sectionStart = 1;
  for (const b of blocks) {
    if (b.kind === 'heading') {
      sinceHeading = 0;
      sectionStart = b.line;
      continue;
    }
    const words = wordsOf(b.text).length;
    for (const s of sentencesIn(b.text)) {
      const n = wordsOf(s).length;
      if (n > DOC_LIMITS.sentenceWords)
        out.push({ line: b.line, what: `a sentence of ${n} words, over ${DOC_LIMITS.sentenceWords}: “${clip(s)}”` });
    }
    if (words > DOC_LIMITS.paragraphWords)
      out.push({ line: b.line, what: `a ${b.kind} of ${words} words, over ${DOC_LIMITS.paragraphWords}: split it` });
    for (const word of fillerIn(b.text)) out.push({ line: b.line, what: fillerMiss(word) });
    sinceHeading += words;
    if (sinceHeading > DOC_LIMITS.wordsPerHeading && sinceHeading - words <= DOC_LIMITS.wordsPerHeading)
      out.push({
        line: sectionStart,
        what: `over ${DOC_LIMITS.wordsPerHeading} words with no heading: add one so the page can be scanned`,
      });
  }
  if (reader) {
    const prose = blocks
      .filter((b) => b.kind !== 'heading')
      .map((b) => (/[.!?]$/.test(b.text) ? b.text : `${b.text}.`))
      .join(' ');
    const grade = readingGrade(prose);
    if (grade > DOC_LIMITS.readerGrade)
      out.push({
        line: 1,
        what: `the page reads at grade ${grade}, over ${DOC_LIMITS.readerGrade}: use shorter words`,
      });
  }
  return out;
}

const clip = (s) => (s.length > 70 ? `${s.slice(0, 67)}…` : s);
const fillerMiss = (word) => `says “${word}”: write “${FILLER.find((f) => f.word === word)?.instead}”`;

/**
 * The comments of a source file, each run of comment lines joined into one, with the line it starts on. Whole-line
 * comments only (`//`, `/* … *\/`, `#` in Python and shell): a comment after code on the same line is a short note.
 */
export function commentsOf(source, file) {
  const hash = /\.(py|sh)$/.test(file) || /(^|\/)\.[a-z]+ignore$/.test(file);
  const lines = source.split('\n');
  const out = [];
  let current = null,
    block = false;
  const close = () => {
    if (current?.text.trim()) out.push({ ...current, text: proseOf(current.text) });
    current = null;
  };
  lines.forEach((raw, i) => {
    const line = raw.trim();
    let text = null;
    if (block) {
      text = line.replace(/\*\/.*$/, '').replace(/^\*\s?/, '');
      if (line.includes('*/')) block = false;
    } else if (!hash && line.startsWith('//')) text = line.replace(/^\/\/+\s?/, '');
    else if (!hash && line.startsWith('/*')) {
      text = line
        .replace(/^\/\*+\s?/, '')
        .replace(/\*\/.*$/, '')
        .replace(/^\*\s?/, '');
      block = !line.includes('*/');
      if (!text.trim()) return (close(), (current = { line: i + 1, text: '' })); // a block opens on its own line
    } else if (hash && line.startsWith('#') && !line.startsWith('#!')) text = line.replace(/^#+\s?/, '');
    if (text === null) return close();
    if (/^(eslint|prettier|@ts-|istanbul|global |c8 |noqa|type: ?ignore|#region|#endregion|graph:)/.test(text)) return;
    if (!text.trim()) return close(); // a blank comment line ends a paragraph
    // a JSDoc tag keeps its words, not its type or name
    text = text.replace(/^@\w+\s*(\{[^}]*\}\s*)?(\[[^\]]*\]|[\w$.]+)?\s*-?\s*/, (m) =>
      /^@(param|property|returns?)\b/.test(m) ? '' : m,
    );
    if (current) current.text += ` ${text}`;
    else current = { line: i + 1, text };
  });
  close();
  return out;
}

/** Every miss in the comments of a source file. */
export function commentMisses(source, file) {
  const out = [];
  for (const c of commentsOf(source, file)) {
    for (const s of sentencesIn(c.text)) {
      const n = wordsOf(s).length;
      if (n > DOC_LIMITS.sentenceWords)
        out.push({ line: c.line, what: `a sentence of ${n} words, over ${DOC_LIMITS.sentenceWords}: “${clip(s)}”` });
    }
    for (const word of fillerIn(c.text)) out.push({ line: c.line, what: fillerMiss(word) });
  }
  return out;
}

/** Files that are made by a command, or kept as records, and never written by hand: the check leaves them out. */
const GENERATED = [
  /^(packages\/graph-spec\/)?dist\//,
  /(^|\/)main\.js$/,
  /^packages\/claude-code\/mod\/(hooks\/graph\.js|bin\/)/,
  /(^|\/)package-lock\.json$/,
  /^test\/(tests-first|seen-failing)\//,
  /^THIRD_PARTY_NOTICES\.md$/,
  /^licences\//,
  /^test-vault\//,
  /^spikes\//,
  /(^|\/)CHANGELOG\.md$/,
  /^LICENSE/,
  /\.min\.(js|css)$/,
];

/** The files the check reads, from git: every document, and every source file whose comments people read. */
export function filesToCheck(root) {
  const all = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
    cwd: root,
    encoding: 'utf8',
  })
    .split('\n')
    .filter(Boolean);
  return all.filter((f) => !GENERATED.some((g) => g.test(f))).filter((f) => /\.(md|js|mjs|cjs|ts|py|sh|css)$/.test(f));
}

/** Every miss in one file, by its kind. */
export function missesIn(file, text) {
  if (file.endsWith('.md')) return documentMisses(text, { reader: READER_PAGES.test(file) });
  return commentMisses(text, file);
}

/** The misses of every file in the project: { file: [miss] }, files with none left out. */
export function projectMisses(root) {
  const out = {};
  for (const file of filesToCheck(root)) {
    let text;
    try {
      text = readFileSync(`${root}/${file}`, 'utf8');
    } catch {
      continue; // listed by git but deleted in the working copy
    }
    const misses = missesIn(file, text);
    if (misses.length) out[file] = misses;
  }
  return out;
}

/** The files whose misses go past their recorded count, each with its count, its record and its misses. */
export function overRecord(misses, record) {
  return Object.entries(misses)
    .filter(([file, list]) => list.length > (record[file] ?? 0))
    .map(([file, list]) => ({ file, count: list.length, recorded: record[file] ?? 0, misses: list }));
}

/** The record lowered to what is there now: a count never rises, and a file with no misses is taken out. */
export function lowered(misses, record) {
  const out = {};
  for (const [file, n] of Object.entries(record)) {
    const now = misses[file]?.length ?? 0;
    if (now) out[file] = Math.min(n, now);
  }
  return out;
}

const RECORD_FILE = 'quality/plain-docs.json';

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const record = JSON.parse(readFileSync(`${root}/${RECORD_FILE}`, 'utf8'));
  const misses = projectMisses(root);
  const args = process.argv.slice(2);
  if (args.includes('--update')) {
    record.counts = lowered(misses, record.counts);
    writeFileSync(`${root}/${RECORD_FILE}`, `${JSON.stringify(record, null, 2)}\n`);
    console.log(`plain-docs: ${Object.keys(record.counts).length} files still recorded`);
  } else {
    const only = args.filter((a) => !a.startsWith('--'));
    for (const [file, list] of Object.entries(misses)) {
      if (only.length && !only.some((o) => file.startsWith(o))) continue;
      for (const m of list) console.log(`${file}:${m.line}  ${m.what}`);
    }
    const over = overRecord(misses, record.counts);
    for (const o of over) console.log(`plain-docs: ${o.file} has ${o.count} misses, over its record of ${o.recorded}`);
    process.exitCode = over.length ? 1 : 0;
  }
}
