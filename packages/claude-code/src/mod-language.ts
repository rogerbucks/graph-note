// The language the mod says its words in (editor spec §42, words_catalogue). The mod API names none, so the mod follows
// the language the system runs in. A language with no translation is said in UK English.
import { setLanguage } from '@thoughtknot/core';

/** Sets the words to the system's language, or to `locale` when given; the language used. */
export function followSystemLanguage(locale: string = Intl.DateTimeFormat().resolvedOptions().locale): string {
  return setLanguage(locale);
}
