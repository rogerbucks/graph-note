// The graph as plain-language sentences, in the page for screen readers and everyone else (spec §26, cc_text_version; §11).
// The sentences are the core's own `textVersion`, the same the Obsidian plugin gives a screen reader, so the two hosts
// say one thing. It is a labelled section of the page, never hidden, and it stands in alone when the drawing cannot be
// made. It is made again with every drawing, so it is always the graph as the note now holds it.
import { textVersion } from '../../core/src/help.ts';
import type { GraphDrawing } from '../../core/src/note-reading.ts';

/** The id of the section, which the drawing's image names as its description. */
export const TEXT_VERSION_ID = 'gn-text-version';

/** The text version of `drawing` as a section: a heading naming the graph, then a list of its sentences. */
export function textVersionSection(doc: Document, drawing: GraphDrawing): HTMLElement {
  const heading = doc.createElement('h2');
  heading.setAttribute('id', `${TEXT_VERSION_ID}-heading`);
  heading.textContent = `Text version of graph ${drawing.graph}`;
  const list = doc.createElement('ul');
  for (const line of textVersion(drawing)) {
    const item = doc.createElement('li');
    item.textContent = line;
    list.append(item);
  }
  const section = doc.createElement('section');
  section.setAttribute('id', TEXT_VERSION_ID);
  section.setAttribute('class', 'gn-text-version');
  section.setAttribute('aria-labelledby', heading.id);
  section.append(heading, list);
  return section;
}
