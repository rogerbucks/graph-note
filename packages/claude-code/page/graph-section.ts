// A note's first graph on the page (spec §9, §26). The core reads it and the worker lays it out. It is drawn as an
// image in the palette of the system's scheme. It is drawn again when the scheme changes (cc_theme_follows). A drawing
// is an isolated image of the SVG. The page's policy allows it from a blob. It runs nothing and does not move. Its
// words always stand beside it, as the graph's text version (text-version.ts). They stand in alone when it cannot be
// drawn. The page never shows a blank for a graph.
import { gqlBlocks } from '../../core/src/blocks.ts';
import { readNote } from '../../core/src/drawing.ts';
import type { LayoutRunner } from '../../core/src/layout-worker.ts';
import { TEXT_VERSION_ID, textVersionSection } from './text-version.ts';

/** What the page says for a note with no graph in it. */
export const NO_GRAPH = 'No graph in this note.';

/** The query that says the system is in its dark scheme. */
export const DARK = '(prefers-color-scheme: dark)';

const counted = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`;

/** Draws the first graph of `note` into `root`, and keeps it drawn in the scheme the system is in. */
export async function showGraph(
  win: Window & typeof globalThis,
  root: HTMLElement,
  note: string,
  layouts: LayoutRunner,
): Promise<void> {
  const doc = win.document;
  const reading = readNote(gqlBlocks(note).map((b) => b.text));
  const [drawing] = reading.graphs.values();
  const say = (text: string) => root.replaceChildren(Object.assign(doc.createElement('p'), { textContent: text }));
  if (!drawing) return say(reading.tooLarge ? 'This note is too large to read here.' : NO_GRAPH);

  const alt = `${drawing.graph}: ${counted(drawing.boxes.length, 'thing')}, ${counted(drawing.links.length, 'link')}`;
  const words = textVersionSection(doc, drawing);
  const picture = doc.createElement('div');
  picture.setAttribute('class', 'gn-drawing');
  root.replaceChildren(picture, words);

  const query = win.matchMedia(DARK);
  let shown: string | null = null;
  const draw = async () => {
    try {
      const drawn = await layouts.draw(drawing, picture, query.matches ? 'dark' : 'light');
      if (!drawn) return;
      if ('reason' in drawn)
        return void picture.replaceChildren(
          Object.assign(doc.createElement('p'), {
            textContent: 'This graph is shown as text only: it is over what is drawn here.',
          }),
        );
      if (shown) win.URL.revokeObjectURL(shown);
      shown = win.URL.createObjectURL(new win.Blob([drawn.svg], { type: 'image/svg+xml' }));
      const img = doc.createElement('img');
      img.src = shown;
      img.setAttribute('alt', alt);
      img.setAttribute('aria-describedby', TEXT_VERSION_ID);
      picture.replaceChildren(img);
    } catch (e) {
      picture.replaceChildren(
        Object.assign(doc.createElement('p'), { textContent: e instanceof Error ? e.message : String(e) }),
      );
    }
  };
  query.addEventListener('change', () => void draw());
  await draw();
}
