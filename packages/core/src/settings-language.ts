// The language option, at the top of the settings page (editor spec §42, language_follows_host). The editor speaks the
// host's language until the person chooses another here: UK English, or a language with a translation file. A
// language is named in itself, the same in every language, so a person can find their own.
import type { Choice, Option } from './settings.ts';
import { translatedLanguages } from './words.ts';

/** A language with a translation as a choice, named in itself: "Français", not "French". */
export function languageChoice(tag: string): Choice {
  const name = new Intl.DisplayNames([tag], { type: 'language' }).of(tag) ?? tag;
  return { value: tag, name: name.charAt(0).toLocaleUpperCase(tag) + name.slice(1), own: true };
}

/** The language the editor speaks: `host` follows the host's, the default. */
export const LANGUAGE_OPTION: Option = {
  key: 'language',
  section: 'Language',
  name: 'Language',
  sentence: 'The language the editor speaks: the same as the app it runs in, or one chosen here.',
  choices: [
    { value: 'host', name: 'Same as the app' },
    { value: 'en-GB', name: 'English (UK)' },
    ...translatedLanguages().map(languageChoice),
  ],
};
