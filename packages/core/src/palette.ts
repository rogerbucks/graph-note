// The one colour mapping (spec §10, one_colour_map): how each host writes the style's colours. Obsidian's entry names
// its theme variables, so a drawing follows the theme. Some hosts draw the SVG as an isolated image, such as a Claude
// Code pane. Such a host can resolve none of the host's variables and may not support color-mix. Its entries are fixed
// colours, the blends worked out here as CSS would work them. The page is painted into the drawing so the contrast
// holds on any background (§11). Or it has both fixed palettes at once, defined in the drawing's own style sheet and
// chosen by the scheme.
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
  /** A style sheet the drawing carries, defining the colours the others name; absent where the host defines them. */
  style?: string;
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

/** The drawing in forced colours: the canvas behind and in every box, and every word and line in the canvas's text. */
const FORCED: Palette = {
  text: 'CanvasText',
  muted: 'CanvasText',
  edge: 'CanvasText',
  page: 'Canvas',
  fill: () => 'Canvas',
  blend: () => 'CanvasText',
};

/**
 * A palette that follows the system's light or dark setting with no help from its host. The drawing carries its own
 * style sheet, naming each colour of the light palette and, under prefers-color-scheme: dark, of the dark one. Its
 * shapes name those. An isolated SVG image honours the scheme (proved in Chromium, 11 Oct 2026). So a host that cannot
 * tell the drawing its theme, a Claude Code pane, gets the scheme the app hands its pages. That is the system's, unless
 * the app sets its own.
 */
export function systemPalette(light: Palette, dark: Palette): Palette {
  const hues = Object.keys(THEME_COLOURS.light).filter((k) => !['page', 'text', 'muted'].includes(k));
  const mixes = [STYLE.line_mix, STYLE.label_mix];
  const known = (h: string) => {
    if (!hues.includes(h)) throw new Error(`the theme has no ${h}`);
    return h;
  };
  const names = (p: Palette): [string, string][] => [
    ['--gn-text', p.text],
    ['--gn-muted', p.muted],
    ['--gn-edge', p.edge],
    ['--gn-page', p.page ?? 'transparent'],
    ...hues.flatMap((h): [string, string][] => [
      [`--gn-fill-${h}`, p.fill(h)],
      ...mixes.map((pct): [string, string] => [`--gn-${h}-${pct}`, p.blend(h, pct)]),
    ]),
  ];
  const sheet = (p: Palette) =>
    `svg{${names(p)
      .map(([n, v]) => `${n}:${v}`)
      .join(';')}}`;
  return {
    text: 'var(--gn-text)',
    muted: 'var(--gn-muted)',
    edge: 'var(--gn-edge)',
    page: 'var(--gn-page)',
    // a name the sheet does not define would draw black: refused, as the fixed palettes refuse a hue they lack
    fill: (h) => `var(--gn-fill-${known(h)})`,
    blend: (h, pct) => {
      known(h);
      if (!mixes.includes(pct)) throw new Error(`the style blends at ${mixes.join(' and ')} only, not ${pct}`);
      return `var(--gn-${h}-${pct})`;
    },
    // forced colours (§44): an image is not forced by the browser, so its sheet gives the system's colours itself
    style: `${sheet(light)}@media (prefers-color-scheme: dark){${sheet(dark)}}@media (forced-colors: active){${sheet(FORCED)}}`,
  };
}

/**
 * The light and shade over a ball in the 3D view (space-canvas-painter.ts), the same in every theme. It is white on the
 * side the light comes from, and a little black on the far side. The graphics chip lights a ball so, in its shader.
 */
export const BALL_LIGHT = { shine: 'rgba(255, 255, 255, 0.45)', shade: 'rgba(0, 0, 0, 0.18)' } as const;

/** The one table: each host's way of writing the colours, by name. */
export const PALETTES: { obsidian: Palette; light: Palette; dark: Palette; system: Palette } = {
  obsidian: {
    text: STYLE.text,
    muted: STYLE.muted,
    edge: STYLE.edge,
    fill: (h) => `rgba(var(--color-${h}-rgb), ${STYLE.fill_opacity})`,
    blend: (h, pct) => `color-mix(in srgb, var(--color-${h}) ${pct}%, var(--text-normal))`,
  },
  light: fixedPalette(THEME_COLOURS.light),
  dark: fixedPalette(THEME_COLOURS.dark),
  system: systemPalette(fixedPalette(THEME_COLOURS.light), fixedPalette(THEME_COLOURS.dark)),
};
