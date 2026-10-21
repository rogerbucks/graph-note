// Numbers, sizes, dates, lists and sorting as the reader's locale writes them (editor spec §42, locale_formats and
// locale_sorting). It uses the platform's own Intl formatters. Only what is shown is formatted here. Nothing the editor
// writes into a note, an export's data or the layout source may pass through it. No locale may change a byte written
// there (locale_never_changes_bytes). The host says the locale once, as it says the language (`setLocale`). Until it
// does, and for a tag the platform does not know, it is UK English, as every message was before.

/** The locale everything is shown in until a host says another. */
export const DEFAULT_LOCALE = 'en-GB';

let current = DEFAULT_LOCALE;
let timeZone: string | undefined;

/** The locale a tag stands for, or the default when the platform knows none it can use. */
function supported(tag: string): string {
  try {
    return Intl.NumberFormat.supportedLocalesOf([tag])[0] ?? DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

/** Sets the locale, and the time zone when given, everything is shown in; the locale used, which may be the default. */
export function setLocale(tag: string, zone?: string): string {
  current = supported(tag);
  timeZone = zone;
  return current;
}

/** The locale things are shown in now. */
export const currentLocale = (): string => current;

/** A count, grouped as the locale groups digits: 12,345 in UK English, 12.345 in German. */
export const formatCount = (n: number): string => n.toLocaleString(current);

/** A size in bytes, as a person reads it: 100 bytes, 12.5 kB, 1.2 MB, in the locale's digits. */
export function formatSize(bytes: number): string {
  const one = (n: number) => (Math.round(n * 10) / 10).toLocaleString(current, { maximumFractionDigits: 1 });
  if (bytes < 1000) return `${formatCount(bytes)} bytes`;
  if (bytes < 1_000_000) return `${one(bytes / 1000)} kB`;
  return `${one(bytes / 1_000_000)} MB`;
}

/** A day, `YYYY-MM-DD` as a note holds it, as the locale writes a day: 17 October 2026 in UK English. */
export function formatDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Intl.DateTimeFormat(current, { dateStyle: 'long', timeZone: 'UTC' }).format(Date.UTC(y, m - 1, d));
}

/** An instant, as the locale writes a day and a time, in the reader's time zone. */
export const formatInstant = (at: Date): string =>
  new Intl.DateTimeFormat(current, { dateStyle: 'medium', timeStyle: 'short', ...(timeZone && { timeZone }) }).format(
    at,
  );

/** Words joined as a list is in the locale: "a, b and c" in UK English. */
export const formatList = (words: string[], type: 'conjunction' | 'disjunction' = 'conjunction'): string =>
  new Intl.ListFormat(current, { style: 'long', type }).format(words);

/**
 * Words joined as the first items of a long list are in the locale, with no "and": "a, b, c" in UK English, "a、b、c"
 * in Japanese. It is for words that the text around them ends, such as "types {types} and {last}".
 */
export function formatSeries(words: string[]): string {
  const parts = new Intl.ListFormat(current, { style: 'long', type: 'conjunction' }).formatToParts([
    'a',
    'b',
    'c',
    'd',
  ]);
  const between = parts.find((p) => p.type === 'literal')?.value ?? ', ';
  return words.join(between);
}

/** Texts sorted as the locale's reader expects, digits as numbers; never for an order written into text. */
export const sortedForReader = (texts: string[]): string[] =>
  [...texts].sort(new Intl.Collator(current, { numeric: true }).compare);
