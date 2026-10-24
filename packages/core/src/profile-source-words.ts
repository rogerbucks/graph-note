// The words of personal profiles (editor spec §39), in UK English. They are the card's label and switch, the things due
// and the pace worked out from the session. They are also the settings page's rows and its review of what was learned.
// views-source-words.ts keeps these with the rest.

/** The words of personal profiles, by key, in UK English. */
export const PROFILE_SOURCE_WORDS = {
  // the card: adapted, or shown as everyone sees it for this session (profile-shown.ts)
  'profile.adapted': 'Adapted for you',
  'profile.shared': 'Shown as everyone sees it, for this session',
  'profile.show-shared': 'Show as shared',
  'profile.show-adapted': 'Show adapted for you',
  // the things due, as the profile puts them
  'profile.due.gentle': 'When you have a moment:',
  'profile.due.firm': 'Due now:',
  'profile.due.item': '{says} (due {due})',
  'profile.due.more': 'and {count} more',
  // the pace worked out from the session, its reason, and the one tap that keeps the usual pace
  'profile.pacing.now': 'Pace: {pace}, because {why}',
  'profile.pace.calm': 'calm',
  'profile.pace.steady': 'steady',
  'profile.pace.brisk': 'brisk',
  'profile.pacing.why.stepped-back': 'you stepped back a few times',
  'profile.pacing.why.skipped-ahead': 'you skipped ahead a few times',
  'profile.pacing.why.paused-long': 'you paused for a long time',
  'profile.pacing.keep': 'Keep my usual pace',
  // the settings page: the profile and its review of what was learned (obsidian profile-settings.ts)
  'profile.heading': 'How graphs are shown to you',
  'profile.sentence':
    'How graphs are shown to you alone. It changes nothing in a note. It is kept with the plugin, never in the vault.',
  'profile.density': 'Density',
  'profile.density.sentence': 'How closely boxes sit.',
  'profile.density.compact': 'Compact',
  'profile.density.standard': 'Standard',
  'profile.density.roomy': 'Roomy',
  'profile.chunk': 'Things at a time',
  'profile.chunk.sentence': 'How many things due are shown at once, from {least} to {most}.',
  'profile.cues': 'Visual cues',
  'profile.cues.sentence': 'Whether boxes carry words, icons or both.',
  'profile.cues.words': 'Words',
  'profile.cues.icons': 'Icons',
  'profile.cues.both': 'Both',
  'profile.reminders': 'Reminders',
  'profile.reminders.sentence': 'How things due are put to you. ThoughtKnot never sends one: a tool you set up does.',
  'profile.reminders.off': 'Off',
  'profile.reminders.gentle': 'Gentle',
  'profile.reminders.firm': 'Firm',
  'profile.pacing': 'Pacing',
  'profile.pacing.sentence': 'How fast a path plays.',
  'profile.pacing.calm': 'Calm',
  'profile.pacing.steady': 'Steady',
  'profile.pacing.brisk': 'Brisk',
  'profile.learned': 'Learned for you',
  'profile.learned.sentence': 'What was learned from how you work. Nothing applies until you approve it.',
  'profile.learned.none': 'Nothing learned yet.',
  'profile.learned.item': '{setting}: {value}, because {why}',
  'profile.learned.approve': 'Approve: {item}',
  'profile.learned.decline': 'Decline: {item}',
  'profile.learned.rollback': 'Roll back: {item}',
  'profile.learned.clear': 'Clear everything learned',
} as const;
