// The plug-ins from outside on the settings page (spec §54, plugin_outside_file). It has a switch for each file in the
// folder, each off until the person turns it on, and a link to add one from. outside-plugins.ts runs them.
import { word } from '@thoughtknot/core';
import type { SettingDefinition, SettingDefinitionItem } from 'obsidian';
import { OUTSIDE_FOLDER } from './outside-plugins';
import type { OutsidePlugins } from './outside-plugins';

/** The control key of a file's switch: `outside.` and the file's name. */
export const OUTSIDE_KEY = 'outside.';
/** The control key of the link typed in. */
export const LINK_KEY = 'outside-link';

/** The section: what it is, a switch for each file, then the link and its Add. */
export function outsideGroup(outside: OutsidePlugins, add: () => void): SettingDefinitionItem {
  const folder = OUTSIDE_FOLDER;
  const files = outside.files();
  const switches: SettingDefinition[] = files.length
    ? files.map((name) => ({ name, desc: word('outside.file'), control: { type: 'toggle', key: OUTSIDE_KEY + name } }))
    : [{ name: word('outside.none', { folder }) }];
  return {
    type: 'group',
    heading: word('outside.heading'),
    items: [
      { name: word('outside.heading'), desc: word('outside.sentence', { folder }) },
      ...switches,
      {
        name: word('outside.link'),
        desc: word('outside.link.sentence', { folder }),
        control: { type: 'text', key: LINK_KEY },
      },
      { name: word('outside.link.add'), action: add },
    ],
  };
}
