// A stand-in for Obsidian's MarkdownRenderer, enough to see what the plugin hands it and how Obsidian would show it: each
// render kept in `state.rendered` (the Markdown, the note it is rendered from, and the component that owns it), and the
// Markdown drawn as Obsidian draws a few marks — an embed (a note's own text drawn inside it, as Obsidian embeds one), a
// wikilink, an image, a Markdown link, maths, bold and emphasis, raw HTML for an <img> or a <b>, and the escapes `&lt;`
// and `\[` — each into an element, the rest as text.

const MARKS = [
  ['embed', /^!\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/],
  ['wiki', /^\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/],
  ['image', /^!\[([^\]]*)\]\(([^)\s]*)\)/],
  ['link', /^\[([^\]]*)\]\(([^)\s]*)\)/],
  ['math', /^\$([^$\n]+)\$/],
  ['strong', /^\*\*([^*]+)\*\*/],
  ['em', /^\*([^*]+)\*/],
  ['html-img', /^<img src="?([^"\s>]*)"?[^>]*>/i],
  ['html-b', /^<b>([^<]*)<\/b>/],
  ['escape-lt', /^&lt;/],
  ['escape-bracket', /^\\\[/],
];

/** Draws `markdown` into `p` as Obsidian would draw these marks; a note embedded, with its own text drawn inside. */
function draw(p, markdown, files) {
  let text = '';
  const flush = () => {
    if (text) p.appendText(text);
    text = '';
  };
  for (let i = 0; i < markdown.length;) {
    const rest = markdown.slice(i);
    const hit = MARKS.map(([kind, re]) => [kind, re.exec(rest)]).find(([, m]) => m);
    if (!hit) {
      text += markdown[i++];
      continue;
    }
    const [kind, m] = hit;
    i += m[0].length;
    if (kind === 'escape-lt') text += '<';
    else if (kind === 'escape-bracket') text += '[';
    else {
      flush();
      if (kind === 'embed') {
        // as Obsidian embeds a note: its text read and drawn in place, remote images and all
        const span = p.createSpan({ cls: 'internal-embed', attr: { src: m[1] } });
        const held = files?.get(`${m[1]}.md`);
        if (typeof held === 'string') draw(span, held, files);
      } else if (kind === 'wiki')
        p.createEl('a', { cls: 'internal-link', text: m[2] ?? m[1], attr: { 'data-href': m[1], href: m[1] } });
      else if (kind === 'image' || kind === 'html-img')
        p.createEl('img', { attr: { src: kind === 'image' ? m[2] : m[1], alt: m[1] } });
      else if (kind === 'link') p.createEl('a', { cls: 'external-link', text: m[1], attr: { href: m[2] } });
      else if (kind === 'math') p.createSpan({ cls: 'math', text: m[1] });
      else if (kind === 'strong' || kind === 'html-b') p.createEl(kind === 'strong' ? 'strong' : 'b', { text: m[1] });
      else p.createEl('em', { text: m[1] });
    }
  }
  flush();
}

/** The MarkdownRenderer of the obsidian module, keeping each render in `state.rendered`. */
export function fakeMarkdownRenderer(state) {
  state.rendered = [];
  return {
    render: async (_app, markdown, el, sourcePath, component) => {
      state.rendered.push({ markdown, sourcePath, component });
      draw(el.createEl('p'), markdown, state.files);
    },
  };
}

/** The Keymap of the obsidian module: a click with Command or Ctrl opens in a new tab, as Obsidian's does. */
export const fakeKeymap = {
  isModEvent: (e) => (e && (e.metaKey || e.ctrlKey) ? 'tab' : false),
};
