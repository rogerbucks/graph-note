// Certainty, drawn (editor spec §36, certainty_drawn; §56, rule_look_not_colour_alone). A thing's certainty is written
// by a likelihood word (graph spec §20) or by being contested (editor spec §28). It is drawn so a reader can tell how
// sure it is without reading its label. It is never shown by colour alone. Each level has its own line weight and
// dash. All but the surest have a mark in words. The look reaches the drawing as a style token, never as a colour.

/** How sure a thing is, as the drawing shows it. */
export const CERTAINTY_LEVELS = ['sure', 'likely', 'doubtful', 'contested'] as const;
/** One level of certainty. */
export type CertaintyLevel = (typeof CERTAINTY_LEVELS)[number];

/** How a level looks: its style token, its line weight, its dash (none for a solid line) and its mark's word key. */
export interface CertaintyLook {
  style: `thing.certainty.${CertaintyLevel}`;
  lineWidth: number;
  dash: number[] | null;
  mark: `certainty.mark.${Exclude<CertaintyLevel, 'sure'>}` | null;
}

/** Each level's look. No two share a line weight and dash, so each is told apart in black and white. */
export const CERTAINTY_LOOKS: Record<CertaintyLevel, CertaintyLook> = {
  sure: { style: 'thing.certainty.sure', lineWidth: 2.5, dash: null, mark: null },
  likely: { style: 'thing.certainty.likely', lineWidth: 1.5, dash: null, mark: 'certainty.mark.likely' },
  doubtful: { style: 'thing.certainty.doubtful', lineWidth: 1, dash: [5, 3], mark: 'certainty.mark.doubtful' },
  contested: { style: 'thing.certainty.contested', lineWidth: 1, dash: [2, 2], mark: 'certainty.mark.contested' },
};

// The likelihood words of graph spec §20, by the level each is drawn at.
const BY_WORD: Record<string, CertaintyLevel> = {
  'almost-certain': 'sure',
  'very-likely': 'sure',
  likely: 'likely',
  'even-chance': 'likely',
  unlikely: 'doubtful',
  'very-unlikely': 'doubtful',
  'almost-no-chance': 'doubtful',
  'cannot-judge': 'doubtful',
};

/**
 * A thing's level of certainty from its properties: contested when its status says so, else from its likelihood word.
 * Null when neither is written, so a thing with no certainty is drawn as it always was.
 */
export function certaintyLevel(props: Record<string, unknown>): CertaintyLevel | null {
  if (props['status'] === 'contested') return 'contested';
  const word = props['likelihood'];
  return typeof word === 'string' ? (BY_WORD[word] ?? null) : null;
}
