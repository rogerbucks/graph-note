// The language setting (editor spec §42, language_follows_host). The words follow the host's language as it is
// installed (host.ts). A host with a settings page may let the person choose another: UK English, or a language with
// a translation file. The locale and the direction follow the language chosen.
import { directionOf, setDirection, setLanguage, setLocale, SOURCE_LANGUAGE } from '@thoughtknot/core';
import { displayHost } from './host.ts';
import type { DisplayHost } from './host.ts';

/** The host installed, or none yet. */
function installedHost(): DisplayHost | null {
  try {
    return displayHost();
  } catch {
    return null;
  }
}

/**
 * Sets the language from the language setting: `host` follows the host installed, else the language named. The locale
 * and the direction follow it. The language used.
 */
export function chooseLanguage(setting = 'host'): string {
  const host = setting === 'host' ? installedHost() : null;
  const language = (setting === 'host' ? host?.language?.() : setting) ?? SOURCE_LANGUAGE;
  // a bare "en", as Obsidian says English, is the source's UK English, not American
  setLocale(language === 'en' ? SOURCE_LANGUAGE : language);
  setDirection(host?.direction?.() ?? directionOf(language));
  return setLanguage(language);
}
