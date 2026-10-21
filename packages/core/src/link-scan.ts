// Finding links in text (editor spec §18, links_shown, safe_to_click). A link is a wikilink, an embed, a Markdown link
// or image, or a bare web or mail address. Each comes with where it is written, what it names and what kind it is. Each
// line is read once through. Every search for a closing mark goes on from where the last one stopped. So text full of
// openers that never close costs no more than its length (spec §9). Only notes and files in the vault and web and mail
// addresses may be opened. Any other scheme, however it is disguised, is refused and shown as text.
import { word } from './words.ts';

/** What a link is: a note or a file in the vault, a web or a mail address, or anything else, which is never opened. */
export type LinkKind = 'note' | 'file' | 'web' | 'mail' | 'refused';

/** A link found in a text. */
export interface FoundLink {
  /** The link as written, whole: `[[Plans|the plans]]`, `![[photo.png]]`, `[map](Maps/Map.md)`, `https://…`. */
  written: string;
  /** Where it starts and ends in the text, in UTF-16 units. */
  start: number;
  end: number;
  /** The note or file it names, without its heading, block or alias, a Markdown link's decoded; or the address. */
  target: string;
  /** Where the target is written in the text: what a rename or a fix changes. */
  targetAt: { start: number; end: number };
  /** What it shows: its alias or label, or what it names. */
  label: string;
  /** Written with `!`, to show what it names in place. */
  embed: boolean;
  kind: LinkKind;
  /** What the host is handed to open: the target with its heading or block, or the address. */
  opens: string;
  /** Written as a Markdown link, whose destination is percent-encoded. */
  markdown: boolean;
}

/** The type of each kind of file a vault holds, by its extension; any other is a note's name. */
const TYPES = new Map<string, string>([
  ...['png', 'jpg', 'jpeg', 'gif', 'bmp', 'svg', 'webp', 'avif', 'heic', 'tif', 'tiff', 'ico'].map(
    (e): [string, string] => [e, 'image'],
  ),
  ...['mp3', 'wav', 'm4a', 'ogg', 'flac', 'aac', '3gp'].map((e): [string, string] => [e, 'audio']),
  ...['mp4', 'mov', 'mkv', 'ogv', 'webm', 'avi'].map((e): [string, string] => [e, 'video']),
  ['pdf', 'PDF'],
  ['canvas', 'canvas'],
  ...['base', 'csv', 'json', 'txt', 'gql', 'docx', 'xlsx', 'pptx', 'zip'].map((e): [string, string] => [
    e,
    `${e.toUpperCase()} file`,
  ]),
]);

/** The type of file a vault link names, in words (`image`, `PDF`, `CSV file`), or null for a note. */
export function attachmentType(target: string): string | null {
  const name = target.slice(target.lastIndexOf('/') + 1),
    dot = name.lastIndexOf('.');
  return dot > 0 ? (TYPES.get(name.slice(dot + 1).toLowerCase()) ?? null) : null;
}

const SCHEME = /^([A-Za-z][A-Za-z0-9+.-]{0,30}):/;
const ENTITY_WORDS: Record<string, string> = { colon: ':', tab: '', newline: '' };

/**
 * The start of a link as a browser would read it. Leading spaces and every control character are dropped. The HTML
 * entities that could spell a colon are decoded. So `java\tscript:` and `javascript&#58;` are both seen for what they
 * are.
 */
function unmasked(target: string): string {
  let out = '';
  for (let i = 0; i < target.length && out.length < 40; i++) {
    const c = target.charCodeAt(i);
    if (c < 0x20 || c === 0x7f || (c === 0x20 && !out)) continue;
    const entity =
      target[i] === '&' ? /^&(#x[0-9a-f]{1,6}|#[0-9]{1,7}|colon|tab|newline);?/i.exec(target.slice(i, i + 12)) : null;
    if (!entity) {
      out += target[i];
      continue;
    }
    const name = (entity[1] ?? '').toLowerCase();
    const code = name.startsWith('#x')
      ? parseInt(name.slice(2), 16)
      : name.startsWith('#')
        ? Number(name.slice(1))
        : -1;
    const decoded = code >= 0 ? String.fromCodePoint(Math.min(code, 0x10ffff)) : (ENTITY_WORDS[name] ?? '');
    // a decoded control, or a decoded space before anything else, is dropped as a written one is
    if (decoded && decoded.charCodeAt(0) > 0x20) out += decoded;
    else if (decoded === ' ' && out) out += decoded;
    i += entity[0].length - 1;
  }
  return out;
}

/** What kind of link `target` is (safe_to_click): only notes, files, web and mail addresses are ever opened. */
export function linkKind(target: string): LinkKind {
  const probe = unmasked(target),
    scheme = SCHEME.exec(probe)?.[1]?.toLowerCase();
  if (scheme === 'http' || scheme === 'https') return 'web';
  if (scheme === 'mailto') return 'mail';
  if (scheme !== undefined || probe.startsWith('//') || probe.startsWith('\\\\')) return 'refused';
  return attachmentType(target) ? 'file' : 'note';
}

/** Percent-decoding of a Markdown link's destination; as written, when it does not decode. */
function decoded(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/**
 * Whether a Markdown destination may never be opened (safe_to_click). It may be refused as written. One that reads as a
 * note or a file is also refused once percent-decoded as a host decodes it. So an encoded scheme is never let through.
 */
export function destinationRefused(raw: string): boolean {
  const kind = linkKind(raw);
  return kind === 'refused' || ((kind === 'note' || kind === 'file') && linkKind(decoded(raw)) === 'refused');
}

/**
 * A search for `s` in `line` that goes on from where it last stopped. Asked from places that only move forward, it
 * looks at each character once. The line's length when there is none.
 */
function seeker(line: string, s: string): (from: number) => number {
  let asked = Infinity,
    found = line.length;
  return (from) => {
    if (from < asked || found < from) {
      const i = line.indexOf(s, from);
      found = i < 0 ? line.length : i;
    }
    asked = from;
    return found;
  };
}

/** The first of `#` or `^` in `s`, or its length: where a vault link's heading or block begins. */
const subpathAt = (s: string): number => {
  for (let i = 0; i < s.length; i++) if (s[i] === '#' || s[i] === '^') return i;
  return s.length;
};

/** Characters that end a bare address, and those taken off its end as the sentence's, not the address's. */
const ENDS = new Set([' ', '\t', '<', '>', '"', "'", '`', '[', ']', '(', ')', '{', '}', '|', '\\']);
const TRAILING = new Set(['.', ',', ';', ':', '!', '?', '*', '_', '~']);
const wordy = (c: string | undefined) => !!c && /[A-Za-z0-9]/.test(c);

/** The links of one line, each at its place in the line. */
function lineLinks(line: string): FoundLink[] {
  const out: FoundLink[] = [];
  const closeWiki = seeker(line, ']]'),
    openWiki = seeker(line, '[['),
    closeLabel = seeker(line, ']'),
    openLabel = seeker(line, '['),
    closeDest = seeker(line, ')'),
    spaceDest = seeker(line, ' ');

  const wiki = (i: number): FoundLink | null => {
    const embed = line[i] === '!',
      o = embed ? i + 1 : i;
    if (line[o] !== '[' || line[o + 1] !== '[') return null;
    const close = closeWiki(o + 2);
    if (close >= line.length || openWiki(o + 2) < close) return null;
    const inner = line.slice(o + 2, close),
      bar = inner.indexOf('|'),
      path = bar < 0 ? inner : inner.slice(0, bar);
    let s = 0,
      e = subpathAt(path);
    while (path[s] === ' ') s++;
    while (e > s && path[e - 1] === ' ') e--;
    const target = path.slice(s, e),
      opens = path.trim();
    if (!opens) return null;
    const kind = target ? linkKind(target) : 'note';
    return {
      written: line.slice(i, close + 2),
      start: i,
      end: close + 2,
      target,
      targetAt: { start: o + 2 + s, end: o + 2 + e },
      label: bar < 0 ? opens : inner.slice(bar + 1).trim() || opens,
      embed,
      kind,
      opens,
      markdown: false,
    };
  };

  const markdown = (i: number): FoundLink | null => {
    const embed = line[i] === '!',
      o = embed ? i + 1 : i;
    if (line[o] !== '[' || line[o + 1] === '[') return null;
    const close = closeLabel(o + 1);
    if (close >= line.length || openLabel(o + 1) < close || line[close + 1] !== '(') return null;
    const end = closeDest(close + 2);
    if (end >= line.length) return null;
    let ds = close + 2,
      de = end;
    while (ds < de && (line[ds] === ' ' || line[ds] === '\t')) ds++; // spaces before a destination, as Markdown allows
    if (line[ds] === '<' && line[de - 1] === '>' && de - ds > 2) {
      ds++;
      de--;
    } else {
      // a destination ends at a space, where only its title may follow: `[x](address "title")`
      const space = spaceDest(ds);
      if (space < de) {
        if (!/^["'(]/.test(line.slice(space, de).trim())) return null;
        de = space;
      }
    }
    const raw = line.slice(ds, de);
    if (!raw) return null;
    const kind = destinationRefused(raw) ? 'refused' : linkKind(raw);
    const vault = kind === 'note' || kind === 'file',
      cut = vault ? subpathAt(raw) : raw.length;
    return {
      written: line.slice(i, end + 1),
      start: i,
      end: end + 1,
      target: vault ? decoded(raw.slice(0, cut)) : raw,
      targetAt: { start: ds, end: ds + cut },
      label: line.slice(o + 1, close),
      embed,
      kind,
      opens: vault ? decoded(raw) : raw,
      markdown: true,
    };
  };

  const address = (i: number): FoundLink | null => {
    if (wordy(line[i - 1])) return null;
    const head = line.slice(i, i + 8).toLowerCase(),
      scheme = head.startsWith('https://') ? 8 : head.startsWith('http://') || head.startsWith('mailto:') ? 7 : 0;
    if (!scheme) return null;
    let e = i + scheme;
    while (e < line.length && !ENDS.has(line[e] ?? ' ') && line.charCodeAt(e) > 0x20) e++;
    while (e > i + scheme && TRAILING.has(line[e - 1] ?? '')) e--;
    if (e === i + scheme) return null;
    const written = line.slice(i, e);
    return {
      written,
      start: i,
      end: e,
      target: written,
      targetAt: { start: i, end: e },
      label: written,
      embed: false,
      kind: head.startsWith('mailto:') ? 'mail' : 'web',
      opens: written,
      markdown: false,
    };
  };

  for (let i = 0; i < line.length;) {
    const c = line[i];
    const found =
      c === '[' || (c === '!' && line[i + 1] === '[')
        ? (wiki(i) ?? markdown(i))
        : c === 'h' || c === 'H' || c === 'm' || c === 'M'
          ? address(i)
          : null;
    if (found) out.push(found);
    i = found ? found.end : i + 1;
  }
  return out;
}

/** Every link in `text`, in order, each at its place in the text. */
export function linksIn(text: string): FoundLink[] {
  const out: FoundLink[] = [];
  for (let from = 0; from <= text.length;) {
    let to = text.indexOf('\n', from);
    if (to < 0) to = text.length;
    for (const l of lineLinks(text.slice(from, to)))
      out.push({
        ...l,
        start: l.start + from,
        end: l.end + from,
        targetAt: { start: l.targetAt.start + from, end: l.targetAt.end + from },
      });
    from = to + 1;
  }
  return out;
}

/**
 * The link a host's own rendered link names by its address (`href`). It is an address, or a note or file with its
 * heading. It is judged as a written one is. So a rendered link is opened, previewed and refused by the same rules.
 */
export function linkTo(href: string): FoundLink {
  const first = linkKind(href),
    vault = first === 'note' || first === 'file',
    cut = vault ? subpathAt(href) : href.length,
    target = href.slice(0, cut);
  const kind = vault ? (target ? linkKind(target) : 'note') : first;
  return {
    written: href,
    start: 0,
    end: href.length,
    target,
    targetAt: { start: 0, end: cut },
    label: href,
    embed: false,
    kind,
    opens: href,
    markdown: false,
  };
}

/** What is said, plainly, before a link that leaves Obsidian is opened; null for a link in the vault. */
export function leavingWords(link: FoundLink): string | null {
  if (link.kind === 'web') return word('links.leaves-web', { target: link.target });
  if (link.kind !== 'mail') return null;
  const to = link.target.slice('mailto:'.length).split('?')[0] ?? '';
  return word('links.leaves-mail', { to });
}

/** What is said of a link that is never opened, shown as text in its place (safe_to_click). */
export const refusedWords = (link: FoundLink): string => word('links.not-opened', { link: link.written });
