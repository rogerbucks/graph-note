// A plug-in's own colours on the page (editor spec §44, plugin_theme_tokens). A host that runs a plug-in adds the
// colours it added as one style sheet made in code, never a style element: Obsidian refuses those, and the browser
// page's policy blocks them. The sheet holds the light and the dark values and the forced colours, so it follows the
// theme by itself (themeTokenCss). The host takes it off again when the plug-in stops.
import { themeTokenCss } from '../theme-tokens.ts';
import type { ThemeToken } from '../theme-tokens.ts';

/**
 * Adds `tokens` to `doc` as a sheet of their own. Gives back what takes it off. Nothing is added with no tokens, or in
 * a document that adopts no sheet made in code (a test's stand-in DOM).
 */
export function adoptTokens(doc: Document, tokens: readonly ThemeToken[]): () => void {
  const css = themeTokenCss(tokens);
  const Sheet = doc.defaultView?.CSSStyleSheet;
  if (!css || !Sheet || !doc.adoptedStyleSheets) return () => {};
  const sheet = new Sheet();
  sheet.replaceSync(css);
  doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, sheet];
  return () => {
    doc.adoptedStyleSheets = doc.adoptedStyleSheets.filter((s) => s !== sheet);
  };
}
