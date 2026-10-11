// The check an edit made for the person passes as it is written (editor spec §4: unnamed_drawn_suggested,
// suggested_name_unique). An edit from the drawing — a path, a Deferred, a list, a name added, a thing added — is checked
// first against the note as the editor last saw it, for a quick answer; but the note can change before the edit is
// written, so the check that counts is made here, against the note actually written into, for the names the edit newly
// writes: none may be a name the note draws only under a suggested name, and none it gives a thing may be another's.
import { dataKind, graphOf } from './blocks.ts';
import { acceptNameFirst, unnamedIn } from './suggested-names.ts';
import { writtenIn } from './written-things.ts';

/** The names a block's text writes or names: each thing's name, and an id given as a property. */
export function namesIn(text: string): Set<string> {
  const out = new Set<string>();
  for (const w of writtenIn(text)) {
    if (w.variable) out.add(w.variable.name);
    const id = w.props.get('id');
    if (id) out.add(id);
  }
  return out;
}

/** The names an edit newly writes or names: in the text after it, and not in the text before. */
export function newNames(before: string, after: string): string[] {
  const had = namesIn(before);
  return [...namesIn(after)].filter((n) => !had.has(n));
}

/** The names a block gives its things, as often as it gives them: each thing it writes by name, and an id property. */
function given(text: string): string[] {
  return writtenIn(text).flatMap((w) => {
    const id = w.props.get('id');
    return [...(w.writes && w.variable ? [w.variable.name] : []), ...(id ? [id] : [])];
  });
}

/**
 * Why an edit cannot be written into a note, or null when it can: `texts` are the note's blocks with the edit in place as
 * block `index` of `graph`, and `names` those the edit newly writes (`newNames`), of which only those still in its text
 * count. Refused, in the words of the check made before, when one is a name the note draws only under a suggested name
 * (accept its name first), or is a name the edit gives a thing that another block of the graph gives too, or that the
 * block gives twice (already a name).
 */
export function editRefusal(
  texts: readonly string[],
  index: number,
  graph: string,
  names: readonly string[],
): string | null {
  const text = texts[index] ?? '',
    still = namesIn(text);
  const keys = names.filter((n) => still.has(n));
  if (!keys.length) return null;
  const first = acceptNameFirst(unnamedIn(texts, graph), graph, keys);
  if (first) return first;
  const own = given(text);
  const elsewhere = new Set(
    texts.flatMap((t, i) => (i !== index && typeof dataKind(t) === 'string' && graphOf(t) === graph ? given(t) : [])),
  );
  const taken = keys.find((n) => own.includes(n) && (elsewhere.has(n) || own.filter((x) => x === n).length > 1));
  return taken ? `${taken} is already a name in graph ${graph}: choose another` : null;
}
