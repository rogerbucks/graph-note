// The settings page's words, in the person's language (editor spec §42, words_catalogue). Each option of settings.ts
// keeps its words in UK English. The catalogue holds them again by the option's key (`settings.<key>.name`,
// `.sentence`, and each choice by its value), so a translation reaches them. The page asks for them here.
import type { Choice, Option } from './settings.ts';
import { SOURCE_WORDS } from './source-words.ts';
import { word } from './words.ts';
import type { WordKey } from './words.ts';

/** An option's key as the catalogue writes it: `aiUse` is `ai-use`. */
const keyOf = (o: Option): string => `settings.${o.key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;

/** The word kept as `key`, in the current language, or `fallback` where the catalogue has no such word. */
const said = (key: string, fallback: string): string =>
  Object.hasOwn(SOURCE_WORDS, key) ? word(key as WordKey) : fallback;

/** The catalogue's key for each word of option `o`, by what it is: its name, its sentence, each choice and its sentence. */
export function optionWordKeys(o: Option): string[] {
  const k = keyOf(o);
  return [
    `${k}.name`,
    `${k}.sentence`,
    ...(o.choices ?? []).flatMap((c) => [
      `${k}.${c.value.toLowerCase()}`,
      ...(c.sentence ? [`${k}.${c.value.toLowerCase()}.sentence`] : []),
    ]),
  ];
}

/** Option `o` with its name, its sentence and its choices' words in the current language. */
export function optionSaid(o: Option): Option {
  const k = keyOf(o);
  const choice = (c: Choice): Choice => {
    const at = `${k}.${c.value.toLowerCase()}`;
    return {
      ...c,
      name: said(at, c.name),
      ...(c.sentence ? { sentence: said(`${at}.sentence`, c.sentence) } : {}),
    };
  };
  return {
    ...o,
    name: said(`${k}.name`, o.name),
    sentence: said(`${k}.sentence`, o.sentence),
    ...(o.choices ? { choices: o.choices.map(choice) } : {}),
  };
}
