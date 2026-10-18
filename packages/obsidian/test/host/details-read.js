// A card's details as a person reads them, for the tests that check what they show: each property as "name: value",
// from the table of names and values (details_properties_table), and each group of links as it reads in words, from its
// heading and its rows of things (details_links_listed, details_ins_outs).

/** The properties `el` shows, each "name: value", in order. */
export const propertiesShown = (el) => {
  const names = el.querySelectorAll('dl.graph-note-rich-properties dt'),
    values = el.querySelectorAll('dl.graph-note-rich-properties dd');
  return names.map((dt, i) => `${dt.textContent}: ${values[i]?.textContent ?? ''}`);
};

/** A group of links as it reads: its reading, its things and, for more than one link, how many. */
export const groupRead = (g) => {
  const r = g.querySelector('.graph-note-link-reading'),
    n = r.querySelector('.graph-note-count')?.textContent ?? '',
    things = g.querySelectorAll('button.graph-note-link-thing').map((b) => b.textContent),
    names = things.length < 2 ? things.join('') : `${things.slice(0, -1).join(', ')} and ${things.at(-1)}`;
  return `${r.textContent.slice(0, r.textContent.length - n.length)} ${names}${n ? ` (${n})` : ''}`;
};

/** Every group of links `el` shows, as each reads. */
export const groupsRead = (el) => el.querySelectorAll('.graph-note-link-group').map(groupRead);
