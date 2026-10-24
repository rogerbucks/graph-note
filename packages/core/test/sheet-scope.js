// What the tests of an exported SVG's movement share (editor spec §7, §16). That is the rules of its style sheet that
// would reach outside the image, were the SVG put inline in a page.
import { cssRules, withoutBlocks, withoutOpenings } from './text-find.js';

/**
 * The selectors of a style sheet that are not under the image's own class (`thoughtknot-image`). So they would reach
 * into a page the SVG is put in. Keyframes have none, and an @media block's rules are read as any other's.
 */
export function unscoped(sheet) {
  const rules = withoutOpenings(withoutBlocks(sheet, '@keyframes'), '@media');
  return cssRules(rules)
    .flatMap((r) => r.selector.split(','))
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith('.thoughtknot-image '));
}
