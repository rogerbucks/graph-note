// A note's classification, as an export reads it (spec §16, classified_export). It is read from its front matter,
// however that writes it:
// - the key in any case;
// - a word, a number, or a list, whose highest level is taken;
// - anything else, which is never taken as no classification.
// It is read from the note's own text when the metadata cache has not indexed it yet.
import { getFrontMatterInfo, parseYaml } from 'obsidian';
import type { App, TFile } from 'obsidian';

/** A word for an unreadable classification: not one of the levels, so the export asks, saying it could not be read. */
const UNREADABLE = 'unreadable';

/** The classification the front matter gives, as text, or null when it gives none; `levels` are lowest first. */
function fromFrontMatter(front: Record<string, unknown> | null | undefined, levels: string[]): string | null {
  if (!front) return null;
  const key = Object.keys(front).find((k) => k.toLowerCase() === 'classification');
  const v = key === undefined ? undefined : front[key];
  if (v === undefined || v === null || v === '') return null;
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (Array.isArray(v)) {
    const words = v.map((x) => (typeof x === 'string' || typeof x === 'number' ? String(x) : UNREADABLE));
    if (!words.length) return null;
    // the highest level listed; a word not among the levels counts above every one, so it is asked about
    const rank = (w: string) => {
      const i = levels.findIndex((l) => l.toLowerCase() === w.trim().toLowerCase());
      return i === -1 ? levels.length : i;
    };
    return words.reduce((a, b) => (rank(b) > rank(a) ? b : a));
  }
  return UNREADABLE;
}

/** The note's classification, from the metadata cache, or from its text when the cache has not indexed it yet. */
export function classificationOf(host: App, file: TFile, text: string, levels: string[]): string | null {
  const cached = host.metadataCache.getFileCache(file);
  if (cached) return fromFrontMatter(cached.frontmatter, levels);
  return classificationInText(text, levels);
}

/** The classification the note's own text gives in its front matter, whatever the metadata cache says. */
export function classificationInText(text: string, levels: string[]): string | null {
  const info = getFrontMatterInfo(text);
  if (!info.exists) return null;
  try {
    return fromFrontMatter(parseYaml(info.frontmatter) as Record<string, unknown> | null, levels);
  } catch {
    return UNREADABLE;
  }
}

/**
 * The higher of two classifications read of one note (`levels` lowest first). One that is not among the levels counts
 * above every one. None counts as `unlabelled`, the level a note with none counts as (below every one when not given).
 * So a disagreement is always settled the cautious way. A tie between none and its level gives none, so the
 * note is still said to have none.
 */
export function higherClassification(
  a: string | null,
  b: string | null,
  levels: string[],
  unlabelled?: string,
): string | null {
  const rank = (c: string | null): number => {
    if (c === null) return unlabelled === undefined ? -1 : rank(unlabelled) + 0.5;
    const i = levels.findIndex((l) => l.toLowerCase() === c.trim().toLowerCase());
    return i === -1 ? levels.length : i;
  };
  return rank(b) > rank(a) ? b : a;
}
