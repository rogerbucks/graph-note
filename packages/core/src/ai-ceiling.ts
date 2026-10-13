// What a model may be sent (editor spec §19, model_ceiling, never_above_ceiling, never_credential): each model carries a
// ceiling, the highest classification of note it may be sent; a note above it is never sent to it, and the editor says
// why and names the models cleared for it. Nothing at the highest classification set is sent to any model, and nothing
// that looks like a credential, whatever the note's classification.
import type { AiModel } from './settings.ts';

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const rank = (levels: string[], level: string) => levels.findIndex((l) => same(l, level));

/** Why a note of `level` (null: it has none) may not be sent to `model`, or null when it may. */
function aboveCeiling(level: string | null, model: AiModel, levels: string[]): string | null {
  // the safe default (Roger may relax it): a note nobody has classified is not taken as the lowest
  if (level === null || !level.trim())
    return `This note has no classification, so nothing of it is sent to any model: give it one first (a classification property in its front matter, one of ${levels.join(', ')}).`;
  const at = rank(levels, level),
    top = levels.length - 1;
  if (at === -1)
    return `This note is classified "${level}", which is not one of the classifications set (${levels.join(', ')}), so it counts as above every ceiling and is not sent.`;
  if (at === top)
    return `This note is classified ${levels[top]}, the highest classification set: nothing at it is ever sent to any model.`;
  const ceiling = rank(levels, model.ceiling);
  if (ceiling === -1)
    return `${model.name}’s ceiling, ${model.ceiling}, is no longer one of the classifications set: choose it again in the model’s settings before anything is sent to it.`;
  return at > ceiling
    ? `This note is classified ${levels[at]}, above ${model.name}’s ceiling, ${levels[ceiling]}, so it is not sent to ${model.name}.`
    : null;
}

/** Whether a note may be sent to a model: yes, or why not and the models that are cleared for it. */
export type Clearance = { cleared: true } | { refused: string; cleared: string[] };

/**
 * Whether a note of `level` may be sent to `model`, against the classifications set (lowest first) and the models that
 * may be asked. A note with no classification is not sent until it is given one; one not among those set counts as
 * above every ceiling; one at the highest is never sent. When it may not, the refusal says why and names the models cleared for it.
 */
export function clearance(level: string | null, model: AiModel, levels: string[], models: AiModel[]): Clearance {
  const why = aboveCeiling(level, model, levels);
  if (!why) return { cleared: true };
  const others = models.filter((m) => m !== model && !aboveCeiling(level, m, levels)).map((m) => m.name);
  const at = level ?? '';
  // only a level a ceiling can reach has a model to offer: none, the highest and an unknown one have none
  const offer = /highest|not one of the classifications|no classification/.test(why)
    ? ''
    : others.length
      ? ` ${others.join(', ')} ${others.length === 1 ? 'is' : 'are'} cleared for ${at}: send to ${others.length === 1 ? 'it' : 'one of them'} instead.`
      : ` No model set up is cleared for ${at}.`;
  return { refused: `${why}${offer}`, cleared: offer ? others : [] };
}

const luhn = (digits: string) => {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) d = d * 2 > 9 ? d * 2 - 9 : d * 2;
    sum += d;
  }
  return sum % 10 === 0;
};

// A secret's name, ending the name a value is given under. In snake_case (user_password, db_secret) it is bounded by
// what is not a letter or digit, never by \b, for which an underscore is part of the word; in camelCase (smtpPassword,
// apiKey) it starts with a capital after a lower-case letter or digit. A bare `key` is an ordinary word (key: 'primary'),
// so only a name ending in _key or Key is a secret's; a real key under a bare name is still found by its value's shape.
const SECRET_NAMES = [
  /(?<![A-Za-z0-9])(?:pass(?:word|wd|phrase|code)?|pwd|pin|secret|token|credentials?)(?![A-Za-z0-9])/i,
  /(?<=_)key(?![A-Za-z0-9])/i,
  /(?<=[a-z0-9])(?:Pass(?:word|wd|phrase|code)?|Pwd|Pin|Secret|Token|Key|Credentials?)(?![A-Za-z0-9])/,
];
// then a text of four characters or more, given to it with a colon or an equals sign
const SECRET_VALUE = String.raw`["']?\s*[:=]\s*["'][^"'\s]{4,}`;

// The kinds of credential looked for, each by its shape: general patterns, never anyone's own.
const CREDENTIALS: { what: string; test: (line: string) => boolean }[] = [
  { what: 'a private key', test: (l) => /-----BEGIN [A-Z ]*PRIVATE KEY/.test(l) },
  { what: 'an access key', test: (l) => /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/.test(l) },
  {
    what: 'an API key',
    test: (l) =>
      /\bsk-[A-Za-z0-9_-]{16,}/.test(l) ||
      /\bAIza[0-9A-Za-z_-]{30,}/.test(l) ||
      /\bgh[pousr]_[A-Za-z0-9]{30,}/.test(l) ||
      /\bgithub_pat_\w{20,}/.test(l) ||
      /\bxox[abeprs]-[A-Za-z0-9-]{10,}/.test(l),
  },
  { what: 'a token', test: (l) => /\beyJ[\w-]{8,}\.eyJ[\w-]{8,}\.[\w-]{8,}/.test(l) },
  {
    what: 'a password or secret',
    test: (l) => SECRET_NAMES.some((name) => new RegExp(`${name.source}${SECRET_VALUE}`, name.flags).test(l)),
  },
  {
    what: 'a card number',
    test: (l) =>
      [...l.matchAll(/(?<![\w.-])[2-6](?:[ -]?\d){12,18}(?![\w.-])/g)].some(([m]) => luhn(m.replace(/[ -]/g, ''))),
  },
];

/**
 * The kinds of credential `text` holds, each once and in words (never the text that matched), with `secrets` — such as
 * the key of the model asked — found wherever they are written.
 */
export function credentialsIn(text: string, secrets: readonly string[] = []): string[] {
  const found = new Set<string>();
  for (const line of text.split('\n')) for (const c of CREDENTIALS) if (c.test(line)) found.add(c.what);
  if (secrets.some((s) => s.length >= 8 && text.includes(s))) found.add('the key of a model set up here');
  return [...found];
}
