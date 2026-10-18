// What is going on with a thing, in a sentence or two at the top of its details (editor spec §25, details_said). It
// says what it is and how it is linked. Each group of links is read as the details list it, naming up to two things and
// counting more. Then it says how many properties and problems it has. A link in that has no reading back, as the graph
// library could guess none, is said in a sentence of its own: "A part of plan this."
import { details } from './render.ts';
import { linkGroups, listed } from './details-nav.ts';
import type { LinkGroup } from './details-nav.ts';
import { propertiesOf } from './inspector.ts';
import type { NoteReading } from './note-reading.ts';
import { word } from './words.ts';

/** The most things a group names; more are counted. */
const MOST_NAMED = 2;

/**
 * A group in words, without its count. Its things are named, in quotes so a name's own stop never ends the sentence. Or
 * counted when there are more than two.
 */
function groupSaid(g: LinkGroup): string {
  const things =
    g.things.length > MOST_NAMED
      ? word('summary.things', { count: g.things.length })
      : listed(g.things.map((t) => word('details.said-name', { name: t.text })));
  return `${g.before}${things}${g.after.replace(/ \(\d+\)$/, '')}`;
}

/** The first letter as a sentence starts it. */
const opening = (s: string) => s.charAt(0).toLocaleUpperCase() + s.slice(1);

/** A kind as a sentence names it: lower case, unless it is written in capitals, as an acronym is. */
const kindSaid = (kind: string) =>
  /^\p{Lu}\p{Ll}/u.test(kind) ? kind.charAt(0).toLocaleLowerCase() + kind.slice(1) : kind;

/**
 * How thing `key` is linked, in a sentence or more, as its details and its tooltip open with. Nothing when graph
 * `graph` does not hold it.
 */
export function linksSaid(reading: NoteReading, graph: string, key: string): string {
  const d = details(reading, graph, key);
  if (!d) return '';
  const groups = linkGroups(reading, graph, key),
    plain = groups.filter((g) => g.before),
    guessed = groups.filter((g) => !g.before);
  const kind = d.kind.split(' · ')[0] ?? '';
  const subject = kind ? word('details.said-this', { kind: kindSaid(kind) }) : word('details.said-it');
  const said: string[] = [];
  if (plain.length) said.push(word('details.said-links', { subject, links: listed(plain.map(groupSaid)) }));
  else if (!guessed.length) said.push(word('details.said-alone', { subject }));
  for (const g of guessed) said.push(`${opening(groupSaid(g))}.`);
  return said.join(' ');
}

/** The sentence or two at the top of thing `key`'s details, or nothing when graph `graph` does not hold it. */
export function thingSaid(reading: NoteReading, graph: string, key: string): string {
  const d = details(reading, graph, key);
  if (!d) return '';
  const properties = propertiesOf(reading, graph, { thing: key }).length,
    problems = d.problems.length;
  const has = word('details.said-has', {
    properties: properties
      ? word('details.said-properties', { count: properties })
      : word('details.said-no-properties'),
    problems: problems ? word('bar.problems', { count: problems }) : word('details.said-no-problems'),
  });
  return `${linksSaid(reading, graph, key)} ${has}`;
}
