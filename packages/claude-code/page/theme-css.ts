// The browser page's colours (spec §26, cc_theme_follows). They are the core's own theme colours (palette.ts,
// `THEME_COLOURS`), as the CSS variables of Obsidian's theme.
// - page.css maps them to the design tokens every rule reads (§44, ui_theme_tokens).
// - The drawing's Obsidian palette names them too.
// - They are light by default, and dark under `prefers-color-scheme`, which is the scheme the pane is handed.
// The core colours the drawing itself in those same variables. So the page and the drawing change together and keep the
// locked contrast (§11). The text and muted text on the page are the core's, 4.5:1 or better in both. This is made when
// the page is built. The page holds no script for the theme.
import { THEME_COLOURS } from '../../core/src/palette.ts';
import type { ThemeColours } from '../../core/src/palette.ts';

const HUES = Object.keys(THEME_COLOURS.light).filter((k) => !['page', 'text', 'muted'].includes(k));

/** `#rrggbb` as the "r, g, b" a CSS `rgba(var(--x-rgb), a)` takes. */
const rgb = (hex: string): string => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ');

/** A shade between two colours, `towards` per cent of the way from `from` to `to`. */
function shade(from: string, to: string, towards: number): string {
  const channel = (hex: string, i: number) => parseInt(hex.slice(i, i + 2), 16);
  return `#${[1, 3, 5]
    .map((i) =>
      Math.round(channel(from, i) + (channel(to, i) - channel(from, i)) * (towards / 100))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

/** The variables of one scheme, in the names the shared styles use. */
function variables(t: ThemeColours): string[] {
  const line = shade(t.page, t.text, 14);
  return [
    `--background-primary:${t.page}`,
    `--background-secondary:${shade(t.page, t.text, 4)}`,
    `--background-modifier-hover:${shade(t.page, t.text, 8)}`,
    `--background-modifier-border:${line}`,
    `--background-modifier-border-hover:${shade(t.page, t.text, 25)}`,
    `--background-modifier-border-focus:${t.purple}`,
    `--text-normal:${t.text}`,
    `--text-muted:${t.muted}`,
    `--text-faint:${t.muted}`,
    // WCAG 2.2 AA (SC 1.4.3): the hues the drawing uses are not text colours. These are drawn towards the text colour
    // until text in them reaches 4.5:1 on the page and on the secondary background
    `--text-error:${shade(t.red ?? t.text, t.text, 35)}`,
    `--text-warning:${shade(t.orange ?? t.text, t.text, 45)}`,
    `--text-on-accent:${t.page}`,
    `--text-selection:${shade(t.page, t.purple ?? t.text, 30)}`,
    `--interactive-accent:${t.purple}`,
    `--link-color:${shade(t.blue ?? t.text, t.text, 40)}`,
    `--link-unresolved-color:${t.muted}`,
    ...[
      'normal',
      'comment',
      'function',
      'keyword',
      'important',
      'operator',
      'property',
      'punctuation',
      'string',
      'tag',
      'value',
    ].map((k) => `--code-${k}:${k === 'comment' || k === 'punctuation' ? t.muted : k === 'normal' ? t.text : t.blue}`),
    `--code-background:${shade(t.page, t.text, 4)}`,
    ...HUES.flatMap((h) => [`--color-${h}:${t[h] ?? ''}`, `--color-${h}-rgb:${rgb(t[h] ?? '#000000')}`]),
    `--shadow-s:0 1px 3px ${shade(t.page, '#000000', 30)}`,
    `--shadow-l:0 4px 16px ${shade(t.page, '#000000', 40)}`,
  ];
}

/** The scale of sizes, fonts, layers and easing the shared styles use, the same in both schemes. */
function scale(): string[] {
  const sizes = [1, 2, 3, 4, 5, 6, 9].flatMap((n) => [`--size-4-${n}:${n * 4}px`]);
  return [
    ...sizes,
    '--size-2-1:2px',
    '--size-2-2:4px',
    '--font-interface:system-ui,-apple-system,"Segoe UI",sans-serif',
    '--font-monospace:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace',
    // the text sizes in rem, so the browser's own font size scales the page (text_scaling)
    '--font-ui-smaller:0.75rem',
    '--font-ui-small:0.8125rem',
    '--font-ui-large:1.125rem',
    '--font-smaller:0.8125rem',
    '--code-size:0.8125rem',
    '--font-bold:700',
    '--font-semibold:600',
    '--radius-s:4px',
    '--radius-m:8px',
    '--radius-l:12px',
    '--icon-xs:14px',
    '--layer-popover:30',
    '--layer-tooltip:40',
    '--layer-modal:50',
    '--cursor-link:pointer',
    '--anim-motion-smooth:ease-in-out',
  ];
}

const block = (selector: string, declarations: string[]) => `${selector}{${declarations.join(';')}}`;

/** The page's theme as a style sheet: light, then dark when the system asks for it. */
export function themeCss(): string {
  return [
    block(':root', ['color-scheme:light dark', ...scale(), ...variables(THEME_COLOURS.light)]),
    `@media (prefers-color-scheme: dark){${block(':root', variables(THEME_COLOURS.dark))}}`,
  ].join('\n');
}
