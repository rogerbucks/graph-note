// The personal profile on the settings page (editor spec §39, profile_settings, learning_review_lens). One row for
// each thing a profile sets: density, things at a time, visual cues, reminders and pacing. Below them sits the private
// review of what was learned. A suggestion waits to be approved or declined. Each approved item rolls back in one tap,
// and one action clears them all.
import { CHUNK_RANGE, CUES, DENSITIES, PACINGS, REMINDER_STYLES, word } from '@thoughtknot/core';
import type { LearnedSuggestion, ProfileSettings, WordKey } from '@thoughtknot/core';
import type { SettingDefinition, SettingDefinitionItem } from 'obsidian';
import type { Profiles } from './profiles';

/** The control key of a profile setting: `profile.` and the setting. */
export const PROFILE_KEY = 'profile.';

const CHOICES = { density: DENSITIES, cues: CUES, reminders: REMINDER_STYLES, pacing: PACINGS } as const;

/** The section: a row for each setting, then what was learned. `update` draws the page again. */
export function profileGroup(profiles: Profiles, update: () => void): SettingDefinitionItem {
  const choice = (key: keyof typeof CHOICES): SettingDefinition => ({
    name: word(`profile.${key}`),
    desc: word(`profile.${key}.sentence`),
    control: {
      type: 'dropdown',
      key: PROFILE_KEY + key,
      options: Object.fromEntries(CHOICES[key].map((v) => [v, word(`profile.${key}.${v}` as WordKey)])),
    },
  });
  const learned = (act: () => boolean | void) => () => {
    act();
    void profiles.changed().then(update);
  };
  const { learning } = profiles;
  // a learned item in the person's words: the setting, its value and the signal it was learned from
  const said = (s: LearnedSuggestion) =>
    word('profile.learned.item', {
      setting: word(`profile.${s.setting}`),
      value: s.setting === 'chunk' ? String(s.value) : word(`profile.${s.setting}.${String(s.value)}` as WordKey),
      why: s.setting === 'pacing' ? word(`profile.pacing.why.${s.why}` as WordKey) : s.why,
    });
  return {
    type: 'group',
    heading: word('profile.heading'),
    items: [
      { name: word('profile.heading'), desc: word('profile.sentence') },
      choice('density'),
      {
        name: word('profile.chunk'),
        desc: word('profile.chunk.sentence', CHUNK_RANGE),
        control: { type: 'slider', key: `${PROFILE_KEY}chunk`, min: CHUNK_RANGE.least, max: CHUNK_RANGE.most, step: 1 },
      },
      choice('cues'),
      choice('reminders'),
      choice('pacing'),
      { name: word('profile.learned'), desc: word('profile.learned.sentence') },
      ...(learning.waiting.length || learning.review().length ? [] : [{ name: word('profile.learned.none') }]),
      ...learning.waiting.flatMap((s): SettingDefinition[] => [
        { name: word('profile.learned.approve', { item: said(s) }), action: learned(() => learning.approve(s.id)) },
        { name: word('profile.learned.decline', { item: said(s) }), action: learned(() => learning.decline(s.id)) },
      ]),
      ...learning.review().map((s): SettingDefinition => ({
        name: word('profile.learned.rollback', { item: said(s) }),
        action: learned(() => learning.rollback(s.id)),
      })),
      { name: word('profile.learned.clear'), action: learned(() => learning.clearAll()) },
    ],
  };
}

/** A profile setting's value as the page shows it. */
export const profileValue = (profiles: Profiles, key: string): unknown =>
  profiles.settings()[key.slice(PROFILE_KEY.length) as keyof ProfileSettings];

/** A profile setting changed on the page. */
export const setProfileValue = (profiles: Profiles, key: string, value: unknown): Promise<void> =>
  profiles.set({ [key.slice(PROFILE_KEY.length)]: key.endsWith('chunk') ? Number(value) : value });
