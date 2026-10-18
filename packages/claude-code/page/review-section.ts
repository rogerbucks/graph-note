// The repository's changes to review on the page (editor spec §41, github_review_items): "Review a change from GitHub…"
// asks the server for the pull requests, merges and commits of the repository the note lives in, only when pressed; the
// one picked is read once and shown in levels, each showing more than the one above: a summary by section, workstream
// and requirement; then each graph changed, drawn in the changes view with every thing and link marked and listed;
// then every line of every file, each marked by a sign as well as its colour. GitHub's titles and texts are shown as
// text, never as markup.
import { changesFigure } from './changes-section.ts';
import type { ChangesDeps } from './changes-section.ts';
import { groupSaid, reviewLevels, workstreamsFrom } from '../../core/src/github-review-items.ts';
import type { ChangedFile, ReviewItem, ReviewLevels, SummaryGroup } from '../../core/src/github-review-items.ts';
import { word } from '../../core/src/words.ts';

/** One item's files as the server sends them: those the gate let through, those it held and why, and the rest. */
export interface PageItemFiles {
  files: ChangedFile[];
  withheld: { path: string; why: string }[];
  workstreams: string | null;
  unread: number;
}

/** What the section needs: the server's two calls, and a layout in a fixed theme and the scheme for the drawings. */
export interface ReviewDeps extends Pick<ChangesDeps, 'layout' | 'dark'> {
  items: () => Promise<ReviewItem[]>;
  files: (item: ReviewItem) => Promise<PageItemFiles>;
}

/** An item named in a line: "Pull request #7: Finish is Done (roger)", "Commit 1a2b3c4: Tidy (Ann)". */
export function itemSaid(item: ReviewItem): string {
  const by = item.author ? word('review.by', { who: item.author }) : '';
  if (item.kind === 'pull') return word('review.pull', { id: item.id, title: item.title, by });
  return word(item.kind === 'merge' ? 'review.merge' : 'review.commit', {
    id: item.id.slice(0, 7),
    title: item.title,
    by,
  });
}

const SIGNS = { keep: ' ', add: '+', remove: '−' } as const;

/** The section's controls and result. */
export function reviewSection(win: Window & typeof globalThis, deps: ReviewDeps): HTMLElement {
  const doc = win.document;
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, cls?: string) => {
    const e = doc.createElement(tag);
    if (text !== undefined) e.textContent = text;
    if (cls) e.setAttribute('class', cls);
    return e;
  };
  const section = el('section', undefined, 'gn-review');
  section.setAttribute('aria-label', word('review.section'));
  const open = el('button', word('review.open'));
  open.setAttribute('type', 'button');
  const chooser = el('div', undefined, 'gn-review-pick');
  const result = el('div', undefined, 'gn-review-result');
  result.setAttribute('aria-live', 'polite');
  section.append(open, chooser, result);
  const say = (text: string) => result.replaceChildren(el('p', text));
  let urls: string[] = [];
  // each item is read once, when it is first opened; one that fails to read is asked again next time
  const read = new Map<string, Promise<{ levels: ReviewLevels; files: PageItemFiles }>>();
  const reviewed = (item: ReviewItem) => {
    const key = `${item.kind}/${item.id}`;
    let r = read.get(key);
    if (!r) {
      r = deps.files(item).then((files) => ({
        files,
        levels: reviewLevels(files.files, workstreamsFrom(files.workstreams ?? '')),
      }));
      r.catch(() => read.delete(key));
      read.set(key, r);
    }
    return r;
  };

  const list = (title: string, lines: string[]) => {
    const part = el('div');
    if (!lines.length) return part;
    const ul = el('ul');
    for (const l of lines) ul.append(el('li', l));
    part.append(el('h4', title), ul);
    return part;
  };

  const levels = (item: ReviewItem, r: ReviewLevels, files: PageItemFiles) => {
    const said = (groups: SummaryGroup[]) => groups.map(groupSaid);
    const summary = el('section', undefined, 'gn-review-summary');
    summary.append(
      el('h3', word('review.summary')),
      list(word('review.by-section'), said(r.summary.sections)),
      list(word('review.by-workstream'), said(r.summary.workstreams)),
      list(
        word('review.requirements'),
        r.summary.requirements.map((q) => q.said),
      ),
    );
    const others = r.summary.otherFiles;
    if (others) summary.append(el('p', word('review.others', { count: others })));
    summary.append(
      list(
        word('review.not-shown'),
        files.withheld.map((w) => `${w.path}: ${w.why}`),
      ),
    );
    if (files.unread) summary.append(el('p', word('review.unread', { count: files.unread })));
    const graphs = el('details', undefined, 'gn-review-graphs');
    graphs.append(el('summary', word('review.graphs', { count: r.graphs.length })));
    r.graphs.forEach((g, i) => {
      const one = el('section');
      one.append(el('h4', word('review.graph', { graph: g.graph, path: g.path })));
      const named = word('review.graph-of', { graph: g.graph, path: g.path, item: itemSaid(item) });
      const figure = changesFigure(win, g.graph, g.shown, named, `gn-review-list-${i}`, deps, (url) => urls.push(url));
      one.append(...figure.parts);
      graphs.append(one);
    });
    const lines = el('details', undefined, 'gn-review-lines');
    lines.append(el('summary', word('review.lines', { count: r.lines.length })));
    for (const f of r.lines) {
      lines.append(el('h4', f.path));
      if (!f.lines) {
        lines.append(el('p', word('review.too-many')));
        continue;
      }
      const ol = el('ol', undefined, 'gn-review-diff');
      for (const l of f.lines) {
        const at = l.kind === 'remove' ? l.old : l.new;
        ol.append(el('li', `${SIGNS[l.kind]} ${at ?? ''} ${l.text}`, `is-${l.kind}`));
      }
      lines.append(ol);
    }
    return [el('h2', itemSaid(item)), summary, graphs, lines];
  };

  const review = async (item: ReviewItem) => {
    say(word('review.reading'));
    try {
      const r = await reviewed(item);
      for (const url of urls) win.URL.revokeObjectURL(url);
      urls = [];
      result.replaceChildren(...levels(item, r.levels, r.files));
    } catch (e) {
      say(e instanceof Error ? e.message : String(e));
    }
  };

  open.addEventListener('click', () => {
    void (async () => {
      say(word('review.reading-all'));
      let items: ReviewItem[];
      try {
        items = await deps.items();
      } catch (e) {
        return say(e instanceof Error ? e.message : String(e));
      }
      const label = el('label', word('review.pick'));
      const pick = el('select');
      pick.setAttribute('id', 'gn-review-pick');
      label.setAttribute('for', pick.id);
      for (const item of items)
        pick.append(Object.assign(el('option', itemSaid(item)), { value: String(items.indexOf(item)) }));
      const go = el('button', word('review.go'));
      go.setAttribute('type', 'button');
      go.addEventListener('click', () => {
        const chosen = items[pick.selectedIndex];
        if (chosen) void review(chosen);
      });
      result.replaceChildren();
      if (!items.length) return say(word('review.none'));
      chooser.replaceChildren(label, pick, go);
      pick.focus();
    })();
  });
  return section;
}
