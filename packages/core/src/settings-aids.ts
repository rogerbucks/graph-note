// The options for the viewer's aids (editor spec §24), with the rest of the Drawing section of the settings page: when the
// mini-map shows (mini_map_setting) and whether the details panel is kept open (details_always_visible).
import type { Option } from './settings.ts';

/** When the mini-map shows (§24, mini_map_setting): never, when the drawing does not fit its view (the default), or always. */
export type MiniMapSetting = 'off' | 'auto' | 'always';

/** The aids' options, in the order the settings page shows them. */
export const AID_OPTIONS: Option[] = [
  {
    key: 'miniMap',
    section: 'Drawing',
    name: 'Mini-map',
    sentence:
      'A small copy of the whole drawing with the part in view outlined; tap or drag it to move the view. Shown never, only when the drawing is bigger than its view, or always.',
    choices: [
      { value: 'off', name: 'Off' },
      { value: 'auto', name: 'When the drawing does not fit' },
      { value: 'always', name: 'Always' },
    ],
  },
  {
    key: 'detailsOpen',
    section: 'Drawing',
    name: 'Keep the details open',
    sentence:
      'Whether the details panel stays open beside the drawing, or below it where the card is narrow. While nothing is chosen, it shows a summary of the graph. Off unless you turn it on.',
    choices: [
      { value: 'on', name: 'On' },
      { value: 'off', name: 'Off' },
    ],
  },
];
