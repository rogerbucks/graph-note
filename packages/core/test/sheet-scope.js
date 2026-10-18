// What the tests of an exported SVG's movement share (editor spec §7, §16): the rules of its style sheet that would reach
// outside the image, were the SVG put inline in a page.

/**
 * The selectors of a style sheet that are not under the image's own class (`thoughtknot-image`), so would reach into a
 * page the SVG is put in: keyframes have none, and an @media block's rules are read as any other's.
 */
export function unscoped(sheet) {
  const rules = sheet.replace(/@keyframes[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '').replace(/@media[^{]*\{/g, '');
  return [...rules.matchAll(/([^{}]+)\{[^{}]*\}/g)]
    .flatMap((m) => m[1].split(','))
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith('.thoughtknot-image '));
}
