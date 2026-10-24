// The personal profiles' part of the core's entry (editor spec §39), kept apart so `index.ts` stays short.
export {
  CHUNK_RANGE,
  CUES,
  DENSITIES,
  PACE_MS,
  PACINGS,
  PERSONAL_LABELS,
  PersonalLayer,
  REMINDER_STYLES,
  SHARED_SETTINGS,
  composeProfiles,
  corporateView,
  profileOf,
} from './profiles.ts';
export type { Cues, Density, Pacing, ProfileSettings, ReminderStyle } from './profiles.ts';
export { ProfileLearning, type LearnedKept, type LearnedSuggestion } from './learning.ts';
export { PACING_SIGNALS_NEEDED, PacingDetector, type PaceShown, type PacingSignal } from './pacing.ts';
export { dueThings, remindersFor, type Reminder } from './reminders.ts';
