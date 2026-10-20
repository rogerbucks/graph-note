// The contract suite of the panels a plug-in adds (editor spec §43, plugin_contract_suites and plugin_rtl). A panel is
// drawn into an element set to read right to left, as an Arabic or Hebrew host sets it. It must keep that direction:
// it forces no direction of its own on anything, except `auto`, which keeps a person's name in its own direction. Its
// inline styles use logical sides only, such as `margin-inline-start`, never `left` or `right`. Like the other
// contracts, each check throws, saying what was wanted.
import { commandContract } from '@thoughtknot/core';
import type { PluginCheck, PluginPanel } from '@thoughtknot/core';

/** A style that names a physical side: `left` or `right`, as a side, a float or an alignment. */
const PHYSICAL_SIDE =
  /(?:^|[;\s])(?:(?:margin|padding|border)-(?:left|right)|left|right)\s*:|(?:float|text-align)\s*:\s*(?:left|right)/i;

/** Fails a check with what was wanted and what the panel did. */
function fail(name: string, wanted: string, got: unknown): never {
  throw new Error(`${name}: wanted ${wanted}, got ${JSON.stringify(got)}`);
}

/** `panel` drawn into a new element from `place`, set to read right to left, with every element it drew. */
function drawnRightToLeft(panel: PluginPanel, place: () => HTMLElement): { root: HTMLElement; drawn: Element[] } {
  const root = place();
  root.dir = 'rtl';
  try {
    panel.render(root);
    return { root, drawn: [...root.querySelectorAll('*')] };
  } finally {
    root.remove();
  }
}

/**
 * Every check a panel of the plug-in `pluginId` is held to. Each draws it into a new, empty element that `place` puts in
 * a page, as a host would; the element is taken out again after.
 */
export function panelContract(panel: PluginPanel, pluginId: string, place: () => HTMLElement): PluginCheck[] {
  const [named, , title] = commandContract({ id: panel.id, title: panel.title, run: () => {} }, pluginId) as [
    PluginCheck,
    PluginCheck,
    PluginCheck,
  ];
  return [
    named,
    {
      name: 'it draws into the element it is given, and keeps that element’s direction',
      run: () => {
        if (typeof panel.render !== 'function') fail(panel.id, 'a render', typeof panel.render);
        const { root } = drawnRightToLeft(panel, place);
        if (root.dir !== 'rtl') fail(panel.id, 'the element left reading right to left', root.dir);
      },
    },
    {
      name: 'it forces no direction on what it draws, but auto, which keeps a name in its own',
      run: () => {
        const forced = drawnRightToLeft(panel, place).drawn.filter((el) =>
          /^(?:ltr|rtl)$/i.test(el.getAttribute('dir') ?? ''),
        );
        if (forced.length)
          fail(
            panel.id,
            'no dir but auto',
            forced.map((el) => `<${el.localName} dir=${el.getAttribute('dir')}>`),
          );
      },
    },
    {
      name: 'its styles use logical sides only, never left or right',
      run: () => {
        const sided = drawnRightToLeft(panel, place).drawn.filter((el) =>
          PHYSICAL_SIDE.test(el.getAttribute('style') ?? ''),
        );
        if (sided.length)
          fail(
            panel.id,
            'styles with logical sides',
            sided.map((el) => el.getAttribute('style')),
          );
      },
    },
    title,
  ];
}
