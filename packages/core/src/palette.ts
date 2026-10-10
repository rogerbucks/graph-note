// The one colour mapping (spec §10, one_colour_map): how each host writes the style's colours. Obsidian's entry names its
// theme variables, so a drawing follows the theme. A host that draws the SVG as an isolated image, such as a Claude Code
// pane, can resolve no variable and may not support color-mix: its entries are fixed colours, the blends worked out
// here as CSS would work them, and the page painted into the drawing so the contrast holds on any background (§11).
import { STYLE } from './layout.ts';

/** How one host writes the drawing's colours. */
export interface Palette {
  /** A box's text. */
  text: string;
  /** A box's kind caption. */
  muted: string;
  /** A link drawn with no hue of its own. */
  edge: string;
  /** A box's fill: its hue at the style's opacity over the page. */
  fill(hue: string): string;
  /** A hue blended with the text colour, `pct` per cent of it the hue, so labels and lines keep their contrast. */
  blend(hue: string, pct: number): string;
  /** The page painted behind the drawing; absent where the host's own page shows through. */
  page?: string;
}

/** A theme's colours, each as six hex digits: the page, the text, the muted text, and every hue the style names. */
export interface ThemeColours {
  page: string;
  text: string;
  muted: string;
  [hue: string]: string;
}

/** Obsidian's default themes, as its app stylesheet sets them (read from Obsidian 1.13, 7 Oct 2026). */
export const THEME_COLOURS: { light: ThemeColours; dark: ThemeColours } = {
  light: {
    page: '#ffffff',
    text: '#222222',
    muted: '#5c5c5c',
    red: '#e93147',
    orange: '#ec7500',
    yellow: '#e0ac00',
    green: '#08b94e',
    cyan: '#00bfbc',
    blue: '#086ddd',
    purple: '#7852ee',
    pink: '#d53984',
  },
  dark: {
    page: '#1e1e1e',
    text: '#dadada',
    muted: '#b3b3b3',
    red: '#fb464c',
    orange: '#e9973f',
    yellow: '#e0de71',
    green: '#44cf6e',
    cyan: '#53dfdd',
    blue: '#027aff',
    purple: '#a882ff',
    pink: '#fa99cd',
  },
};

const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
/** color-mix(in srgb, a p, b): each channel mixed as it is stored, rounded to a byte. */
const mixed = (a: string, b: string, p: number) => {
  const y = channels(b);
  return `#${channels(a)
    .map((x, i) =>
      Math.round(x * p + (y[i] ?? 0) * (1 - p))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
};

/** A palette of fixed colours from a theme's: no variable and no color-mix, the page painted in. */
export function fixedPalette(t: ThemeColours): Palette {
  const hue = (h: string) => {
    const c = t[h];
    if (!c) throw new Error(`the theme has no ${h}`);
    return c;
  };
  return {
    text: t.text,
    muted: t.muted,
    edge: t.muted,
    page: t.page,
    fill: (h) => mixed(hue(h), t.page, STYLE.fill_opacity),
    blend: (h, pct) => mixed(hue(h), t.text, pct / 100),
  };
}

/** The one table: each host's way of writing the colours, by name. */
export const PALETTES: { obsidian: Palette; light: Palette; dark: Palette } = {
  obsidian: {
    text: STYLE.text,
    muted: STYLE.muted,
    edge: STYLE.edge,
    fill: (h) => `rgba(var(--color-${h}-rgb), ${STYLE.fill_opacity})`,
    blend: (h, pct) => `color-mix(in srgb, var(--color-${h}) ${pct}%, var(--text-normal))`,
  },
  light: fixedPalette(THEME_COLOURS.light),
  dark: fixedPalette(THEME_COLOURS.dark),
};
