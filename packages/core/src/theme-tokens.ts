// The interface's design tokens (editor spec §44, ui_theme_tokens and plugin_theme_tokens). One set of named tokens,
// `--gn-*`, covers colour, type, spacing, corners and depth. Every rule of the style sheets reads them and nothing else
// of a host's. Each host maps its own theme to the tokens in one place. Obsidian's sheet (styles.css) does it by the
// table here, written out for each of the plugin's own elements. So the interface takes the theme's colours and sizes
// where it is shown, as Obsidian's own does. The browser page's sheet does it from the theme it is built with. A
// plug-in inherits every token and may add colours of its own, named under its id. Each is in light and dark, and each
// meets the locked contrast (§11) on the background it sits on. The drawing's colours are not here: they come from the
// one colour mapping (palette.ts). The drawing's own sheet names its colours `--gn-text`, `--gn-page` and the like,
// which no token takes.
import { THEME_COLOURS } from './palette.ts';

/** What kind of thing a token holds. */
export type ThemeTokenKind = 'colour' | 'type' | 'spacing' | 'corners' | 'depth' | 'pointer';

/** What one design token is for. */
export interface ThemeTokenUse {
  /** The kind of value it holds. */
  kind: ThemeTokenKind;
  /** What the interface paints, sets or spaces with it. */
  says: string;
}

/** The one table: each token, the variable of Obsidian's theme it is mapped from, its kind and what it is for. */
const TABLE: [token: string, obsidian: string, kind: ThemeTokenKind, says: string][] = [
  ['--gn-bg', '--background-primary', 'colour', 'the background of a card, a pane or the page'],
  ['--gn-bg-alt', '--background-secondary', 'colour', 'the background of a bar, a strip, a sheet or a control'],
  ['--gn-bg-hover', '--background-modifier-hover', 'colour', 'the background of a row the pointer is over'],
  ['--gn-border', '--background-modifier-border', 'colour', 'the line around a card, a control or a section'],
  ['--gn-border-hover', '--background-modifier-border-hover', 'colour', 'that line where the pointer is over it'],
  ['--gn-border-focus', '--background-modifier-border-focus', 'colour', 'that line, or a ring, with the focus'],
  ['--gn-text-normal', '--text-normal', 'colour', 'body text, and the focus ring drawn in it'],
  ['--gn-text-muted', '--text-muted', 'colour', 'secondary text: captions, hints and counts'],
  ['--gn-text-faint', '--text-faint', 'colour', 'a mark that only accompanies text, such as an underline'],
  ['--gn-text-error', '--text-error', 'colour', 'the text and mark of a problem'],
  ['--gn-text-warning', '--text-warning', 'colour', 'the text and mark of a warning'],
  ['--gn-text-on-accent', '--text-on-accent', 'colour', 'text on the accent colour'],
  ['--gn-text-selection', '--text-selection', 'colour', 'the background of selected text'],
  ['--gn-accent', '--interactive-accent', 'colour', 'the accent of a chosen or leading control'],
  ['--gn-link', '--link-color', 'colour', 'a link to a note that exists'],
  ['--gn-link-unresolved', '--link-unresolved-color', 'colour', 'a link to a note that does not exist yet'],
  ['--gn-hue-red', '--color-red', 'colour', 'the red of a mark that says a thing went wrong'],
  ['--gn-hue-orange', '--color-orange', 'colour', 'the orange of a mark that says a thing needs a look'],
  ['--gn-hue-green', '--color-green', 'colour', 'the green of a mark that says a thing is well'],
  ['--gn-code-background', '--code-background', 'colour', 'the background of a block of code'],
  ['--gn-code-normal', '--code-normal', 'colour', 'the text of code'],
  ['--gn-code-keyword', '--code-keyword', 'colour', 'a keyword in highlighted code'],
  ['--gn-code-important', '--code-important', 'colour', 'a label or type in highlighted code'],
  ['--gn-code-operator', '--code-operator', 'colour', 'an operator or arrow in highlighted code'],
  ['--gn-code-value', '--code-value', 'colour', 'a number or constant in highlighted code'],
  ['--gn-code-tag', '--code-tag', 'colour', 'a variable in highlighted code'],
  ['--gn-code-string', '--code-string', 'colour', 'a string in highlighted code'],
  ['--gn-code-property', '--code-property', 'colour', 'a property name in highlighted code'],
  ['--gn-code-function', '--code-function', 'colour', 'a function name in highlighted code'],
  ['--gn-shadow-s', '--shadow-s', 'depth', 'the shadow of a card or a menu lifted a little'],
  ['--gn-shadow-l', '--shadow-l', 'depth', 'the shadow of a sheet or a tooltip lifted over the page'],
  ['--gn-layer-popover', '--layer-popover', 'depth', 'the stacking level of a menu or a notice'],
  ['--gn-layer-tooltip', '--layer-tooltip', 'depth', 'the stacking level of a tooltip'],
  ['--gn-layer-modal', '--layer-modal', 'depth', 'the stacking level of a full-screen view'],
  ['--gn-font-ui', '--font-interface', 'type', 'the typeface of the interface'],
  ['--gn-font-mono', '--font-monospace', 'type', 'the typeface of code and source text'],
  ['--gn-font-size-xs', '--font-ui-smaller', 'type', 'the smallest text of the interface'],
  ['--gn-font-size-s', '--font-ui-small', 'type', 'the small text of the interface, for most controls'],
  ['--gn-font-size-l', '--font-ui-large', 'type', 'the large text of a heading in the interface'],
  ['--gn-font-size-text-s', '--font-smaller', 'type', 'text a step smaller than the note’s own'],
  ['--gn-code-size', '--code-size', 'type', 'the size of code'],
  ['--gn-font-weight-bold', '--font-bold', 'type', 'the weight of bold text'],
  ['--gn-font-weight-semibold', '--font-semibold', 'type', 'the weight of a label that stands out'],
  ['--gn-icon-xs', '--icon-xs', 'spacing', 'the size of a small icon'],
  ['--gn-space-half-1', '--size-2-1', 'spacing', 'the finest step of space, 2 pixels by default'],
  ['--gn-space-half-2', '--size-2-2', 'spacing', 'the second fine step of space, 4 pixels by default'],
  ['--gn-space-1', '--size-4-1', 'spacing', 'one step of space, 4 pixels by default'],
  ['--gn-space-2', '--size-4-2', 'spacing', 'two steps of space, 8 pixels by default'],
  ['--gn-space-3', '--size-4-3', 'spacing', 'three steps of space, 12 pixels by default'],
  ['--gn-space-4', '--size-4-4', 'spacing', 'four steps of space, 16 pixels by default'],
  ['--gn-space-5', '--size-4-5', 'spacing', 'five steps of space, 20 pixels by default'],
  ['--gn-space-6', '--size-4-6', 'spacing', 'six steps of space, 24 pixels by default'],
  ['--gn-space-9', '--size-4-9', 'spacing', 'nine steps of space, 36 pixels by default'],
  ['--gn-radius-s', '--radius-s', 'corners', 'the rounding of a small control’s corners'],
  ['--gn-radius-m', '--radius-m', 'corners', 'the rounding of a menu’s or a notice’s corners'],
  ['--gn-radius-l', '--radius-l', 'corners', 'the rounding of a card’s corners'],
  ['--gn-cursor-link', '--cursor-link', 'pointer', 'the pointer over something that opens a note'],
];

/** Every design token, by name, with what it is for: what a plug-in inherits and what the style sheets read. */
export const THEME_TOKENS: Readonly<Record<string, ThemeTokenUse>> = Object.freeze(
  Object.fromEntries(TABLE.map(([token, , kind, says]) => [token, Object.freeze({ kind, says })])),
);

/** Obsidian's mapping: each token and the variable of Obsidian's theme it reads, written out at the top of styles.css. */
export const OBSIDIAN_TOKEN_MAP: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(TABLE.map(([token, obsidian]) => [token, obsidian])),
);

/** The colour tokens that forced colours give other than the text colour: backgrounds, the accent and links. */
const FORCED_OTHER: Readonly<Record<string, string>> = {
  '--gn-bg': 'Canvas',
  '--gn-bg-alt': 'Canvas',
  '--gn-bg-hover': 'Canvas',
  '--gn-code-background': 'Canvas',
  '--gn-accent': 'Highlight',
  '--gn-text-selection': 'Highlight',
  '--gn-text-on-accent': 'HighlightText',
  '--gn-link': 'LinkText',
  '--gn-link-unresolved': 'LinkText',
};

/**
 * Forced colours (editor spec §44, forced_colours). Each colour token is given as the system colour it takes when the
 * system forces its own, such as a high contrast theme of Windows. A background is the canvas; the accent and a
 * selection are the highlight; a link is the link colour. Every other colour, of text, line, mark or code, is the
 * canvas's text. No meaning is lost with the hues, as none is said by colour alone (§5). Each sheet writes this out
 * under forced-colors.
 */
export const FORCED_TOKEN_COLOURS: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(
    TABLE.filter(([, , kind]) => kind === 'colour').map(([token]) => [token, FORCED_OTHER[token] ?? 'CanvasText']),
  ),
);

/**
 * More contrast (editor spec §44, forced_colours): when the system asks for more contrast, secondary text, faint marks
 * and lines take the full text colour. Each sheet writes this out under prefers-contrast: more.
 */
export const MORE_CONTRAST_TOKENS: Readonly<Record<string, string>> = Object.freeze({
  '--gn-text-muted': 'var(--gn-text-normal)',
  '--gn-text-faint': 'var(--gn-text-normal)',
  '--gn-border': 'var(--gn-text-normal)',
  '--gn-border-hover': 'var(--gn-text-normal)',
});

/** The locked contrast (§11, WCAG 2.2 AA): 4.5:1 for text (SC 1.4.3), 3:1 for a line or a control's edge (SC 1.4.11). */
export const LOCKED_CONTRAST = Object.freeze({ text: 4.5, line: 3 });

/** A colour of a plug-in's own, as it adds it: its name, its light and dark values, what it sits on and what it is. */
export interface ThemeToken {
  /** `--gn-plugin-<the plug-in's id, its dots as hyphens>-<a word>`: `--gn-plugin-acme-tags-tag`. */
  name: string;
  /** Its colour in the light theme, as `#rrggbb` or `#rgb`. */
  light: string;
  /** Its colour in the dark theme, the same way. */
  dark: string;
  /** The core background it sits on, the page's unless it says. */
  on?: '--gn-bg' | '--gn-bg-alt';
  /** Text, held to 4.5:1, unless it says it is a line, held to 3:1. */
  part?: 'text' | 'line';
}

const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
/** `#rgb` as `#rrggbb`. */
const long = (c: string) => (c.length === 4 ? `#${[...c.slice(1)].map((x) => x + x).join('')}` : c).toLowerCase();
/** A shade `p` of the way from `from` to `to`, each channel rounded, as the browser page's theme works it out. */
const shade = (from: string, to: string, p: number) => {
  const b = channels(to);
  return `#${channels(from)
    .map((x, i) =>
      Math.round(x + ((b[i] ?? 0) - x) * p)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
};

/**
 * The core backgrounds a plug-in's colour may sit on, in each theme: Obsidian's default themes, which the browser
 * page's theme gives as well. In both, the secondary background is the page drawn 4 per cent towards the text.
 */
export const TOKEN_BACKGROUNDS: Readonly<Record<'--gn-bg' | '--gn-bg-alt', { light: string; dark: string }>> = {
  '--gn-bg': { light: THEME_COLOURS.light.page, dark: THEME_COLOURS.dark.page },
  '--gn-bg-alt': {
    light: shade(THEME_COLOURS.light.page, THEME_COLOURS.light.text, 0.04),
    dark: shade(THEME_COLOURS.dark.page, THEME_COLOURS.dark.text, 0.04),
  },
};

/** Whether `c` is a colour as a token gives one: `#rrggbb` or `#rgb`. */
export const isTokenColour = (c: unknown): c is string =>
  typeof c === 'string' && /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(c);

/** The contrast ratio of two opaque `#rrggbb` or `#rgb` colours, as WCAG 2.2 works it out. */
export function contrastRatio(a: string, b: string): number {
  const luminance = (c: string) =>
    channels(long(c))
      .map((v) => v / 255)
      .map((s) => (s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4))
      .reduce((sum, s, i) => sum + s * ([0.2126, 0.7152, 0.0722][i] ?? 0), 0);
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return ((x ?? 0) + 0.05) / ((y ?? 0) + 0.05);
}

/** The prefix every token of the plug-in `pluginId` is named under: its dots as hyphens. */
export const tokenPrefix = (pluginId: string) => `--gn-plugin-${pluginId.replace(/\./g, '-')}-`;

/** Why `name` is not a token the plug-in `pluginId` may add, or null when it is. */
export function tokenNameProblem(name: unknown, pluginId: string): string | null {
  const prefix = tokenPrefix(pluginId);
  if (typeof name !== 'string' || !name.startsWith(prefix) || !/^[a-z][a-z0-9-]*$/.test(name.slice(prefix.length)))
    return `the theme token "${String(name)}" is not named ${prefix}<a lower-case word>, so it could take a core token's or another plug-in's`;
  return null;
}

/** Why the colours of `t` are not ones a token may give, or null when they are. */
export function tokenColourProblem(t: ThemeToken): string | null {
  for (const c of [t.light, t.dark])
    if (!isTokenColour(c)) return `the theme token ${t.name}'s "${String(c)}" is not a colour as #rrggbb or #rgb`;
  if (t.on !== undefined && !Object.hasOwn(TOKEN_BACKGROUNDS, t.on))
    return `the theme token ${t.name} sits on ${String(t.on)}, not on --gn-bg or --gn-bg-alt`;
  if (t.part !== undefined && t.part !== 'text' && t.part !== 'line')
    return `the theme token ${t.name} is for "${String(t.part)}", not for text or a line`;
  return null;
}

/** Why `t`'s colour in `theme` misses the locked contrast on its background, or null when it meets it. */
export function tokenContrastProblem(t: ThemeToken, theme: 'light' | 'dark'): string | null {
  const on = t.on ?? '--gn-bg';
  const part = t.part ?? 'text';
  const need = LOCKED_CONTRAST[part];
  const ratio = contrastRatio(t[theme], TOKEN_BACKGROUNDS[on][theme]);
  if (ratio >= need) return null;
  return `${t.name} reaches ${ratio.toFixed(1)}:1 on ${on} in the ${theme} theme, short of the locked ${need}:1 for ${part === 'text' ? 'text' : 'a line'}`;
}

/** Why the plug-in `pluginId` may not add `t`, or null when it may: its name, its colours, then its contrast in each theme. */
export function themeTokenProblem(t: ThemeToken, pluginId: string): string | null {
  return (
    tokenNameProblem(t.name, pluginId) ??
    tokenColourProblem(t) ??
    tokenContrastProblem(t, 'light') ??
    tokenContrastProblem(t, 'dark')
  );
}

/**
 * The plug-ins' tokens as CSS a host applies:
 * - the light values at the root and under Obsidian's light theme class;
 * - the dark ones when the system asks for dark (the browser page), and under Obsidian's dark theme class. That class
 *   is on the body, so it wins over the root whichever the system asks;
 * - in forced colours, each the canvas's text, as the core's own text and lines are.
 * Nothing when there are none.
 */
export function themeTokenCss(tokens: readonly ThemeToken[]): string {
  if (!tokens.length) return '';
  const values = (theme: 'light' | 'dark') => tokens.map((t) => `${t.name}:${t[theme]}`).join(';');
  return [
    `:root,.theme-light{${values('light')}}`,
    `@media (prefers-color-scheme: dark){:root{${values('dark')}}}`,
    `.theme-dark{${values('dark')}}`,
    `@media (forced-colors: active){:root,.theme-light,.theme-dark{${tokens.map((t) => `${t.name}:CanvasText`).join(';')}}}`,
  ].join('\n');
}
