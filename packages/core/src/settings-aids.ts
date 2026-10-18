// The options for the viewer's aids (editor spec §24), with the rest of the Drawing section of the settings page: when the
// mini-map shows (mini_map_setting), whether the details panel is kept open (details_always_visible), and how tall a
// drawing in a note may be (drawing_height_setting).
import type { Option } from './settings.ts';

/** When the mini-map shows (§24, mini_map_setting): never, when the drawing does not fit its view (the default), or always. */
export type MiniMapSetting = 'off' | 'auto' | 'always';

/** How tall a drawing in a note may be (§24, drawing_height_setting): half the window, three quarters (the default), or as
    tall as the drawing fitted to its width. */
export type DrawingHeightSetting = 'half' | 'most' | 'none';

/** The share of the window a drawing in a note may take, as the setting says; null for no limit. */
export const tallestOf = (s: DrawingHeightSetting): number | null => (s === 'half' ? 0.5 : s === 'none' ? null : 0.75);

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
  {
    key: 'drawingHeight',
    section: 'Drawing',
    name: 'Tallest drawing in a note',
    sentence:
      'How much of the window a drawing in a note may take. A taller one is fitted inside, so the rest of the note stays in reach.',
    choices: [
      { value: 'half', name: 'Half the window' },
      { value: 'most', name: 'Three quarters of the window' },
      { value: 'none', name: 'No limit' },
    ],
  },
];
