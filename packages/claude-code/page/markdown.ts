// The browser editor's one Markdown renderer (spec §26, cc_one_renderer, cc_text_not_html): marked, with raw HTML turned
// off.
// - Every HTML tag a note writes comes out as escaped text, never as an element.
// - A link is made only to a web or mail address. Any other kind is shown as its text and never run (safe_to_click).
// - An image is never loaded from anywhere (cc_no_remote). It stays a link to where it is, or its description as text.
import { Marked } from 'marked';
import type { Tokens } from 'marked';

const SAFE_ADDRESS = /^(?:https?:|mailto:)/i;

const escaped = (text: string): string =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/** `<a>` to a web or mail address, which opens beyond the editor and hands it nothing. */
function anchor(href: string, inner: string, title?: string | null): string {
  const address = href.trim();
  if (!SAFE_ADDRESS.test(address)) return inner;
  const named = title ? ` title="${escaped(title)}"` : '';
  return `<a href="${escaped(address)}" rel="noopener noreferrer" target="_blank"${named}>${inner}</a>`;
}

const renderer = new Marked({
  gfm: true,
  async: false,
  renderer: {
    // raw HTML, block or inline, is text
    html: ({ text }: Tokens.HTML | Tokens.Tag) => escaped(text),
    link(this: { parser: { parseInline(tokens: Tokens.Generic[]): string } }, { href, title, tokens }: Tokens.Link) {
      return anchor(href, this.parser.parseInline(tokens), title);
    },
    image: ({ href, title, text }: Tokens.Image) => anchor(href, escaped(text), title),
  },
});

/** The HTML of `markdown`: its own tags only, and every tag the note itself wrote as escaped text. */
export function markdownHtml(markdown: string): string {
  return renderer.parse(markdown, { async: false });
}

/**
 * `markdown` rendered into `el`, replacing what it held. The HTML is parsed in a document of its own, which runs
 * nothing. Then its nodes are moved over. No HTML string is ever handed to the page.
 */
export function renderMarkdown(markdown: string, el: HTMLElement): void {
  const parsed = new DOMParser().parseFromString(`<body>${markdownHtml(markdown)}</body>`, 'text/html');
  el.replaceChildren(...Array.from(parsed.body.childNodes, (n) => el.ownerDocument.importNode(n, true)));
}
