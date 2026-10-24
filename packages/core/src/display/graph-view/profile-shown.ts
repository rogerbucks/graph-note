// A personal profile on the card (editor spec §39, profile_settings, adapted_for_viewer, pacing_automatic). The profile
// changes how the graph is shown to its viewer, never the graph. It sets how dense the boxes sit and which cues they
// carry. It shows the things due a chunk at a time, gently or firmly, and sets how fast a path plays. A label says the
// card is adapted. One tap shows it as everyone sees it, for this session only. That is never saved, so the next session
// is adapted again. The pace worked out from this session shows with its reason, and one tap keeps the usual pace.
import { CUES, DENSITIES, PACE_MS, dueThings, word } from '@thoughtknot/core';
import type { LearnedSuggestion, PacingDetector, PacingSignal, ProfileSettings } from '@thoughtknot/core';
import { button } from '../button';
import type { ViewOptions } from './view-options';

/** A profile as the card is given it: what it sets, and the session's own switch and pace. */
export interface ProfileShown {
  /** What the viewer's profiles compose to, with what they approved of what was learned. */
  settings: ProfileSettings;
  /** Whether it differs from what everyone sees; when not, no label shows. */
  adapted: boolean;
  /** Show-as-shared, for this session only. */
  shared: () => boolean;
  setShared: (on: boolean) => void;
  /** The pace of this session, from what the session shows. */
  pacing: PacingDetector;
  /** A change to the profile learned this session: it waits for the owner's approval. */
  suggest: (s: LearnedSuggestion) => void;
  /** Today, as an ISO date, for what is due. */
  today: string;
}

/** The classes a profile puts on the card, each with every value it can take. */
const CLASSES = { density: DENSITIES, cues: CUES } as const;

/** The profile's label and what it shows on the card, drawn again in place when show-as-shared is tapped. */
export function showProfile(root: HTMLElement, o: ViewOptions): void {
  const p = o.profile;
  if (!p?.adapted) return;
  const strip = root.createDiv({ cls: 'thoughtknot-adapted' });
  const due = root.createDiv({ cls: 'thoughtknot-due' });
  const draw = () => {
    const shared = p.shared();
    for (const [name, values] of Object.entries(CLASSES) as [keyof typeof CLASSES, readonly string[]][])
      for (const v of values) root.classList.toggle(`thoughtknot-${name}-${v}`, !shared && p.settings[name] === v);
    strip.empty();
    strip.createSpan({ text: word(shared ? 'profile.shared' : 'profile.adapted') });
    button(strip, word(shared ? 'profile.show-adapted' : 'profile.show-shared'), 'eye', () => {
      p.setShared(!shared);
      draw();
    });
    dueShown(due, shared ? null : p.settings, o);
  };
  draw();
}

/** The things due, as the profile puts them: a chunk at a time, gently or firmly; none when reminders are off. */
function dueShown(el: HTMLElement, settings: ProfileSettings | null, o: ViewOptions): void {
  el.empty();
  const graph = o.reading.world[o.graph];
  const all = settings && settings.reminders !== 'off' && graph ? dueThings(graph, o.profile?.today ?? '') : [];
  el.hidden = !all.length;
  if (!settings || !all.length) return;
  el.classList.toggle('thoughtknot-due-firm', settings.reminders === 'firm');
  el.classList.toggle('thoughtknot-due-gentle', settings.reminders === 'gentle');
  el.createSpan({
    cls: 'thoughtknot-due-said',
    text: word(`profile.due.${settings.reminders === 'firm' ? 'firm' : 'gentle'}`),
  });
  const list = el.createEl('ul');
  for (const d of all.slice(0, settings.chunk)) list.createEl('li', { text: word('profile.due.item', d) });
  if (all.length > settings.chunk)
    el.createSpan({ text: word('profile.due.more', { count: all.length - settings.chunk }) });
}

/** The pace a path starts at: the profile's, unless the card is shown as shared. */
export const startPace = (o: ViewOptions, otherwise: number): number =>
  o.profile && o.profile.adapted && !o.profile.shared() ? PACE_MS[o.profile.pacing.shown.pacing] : otherwise;

/**
 * The pace indicator in a path's controls. It takes the session's signals and shows a change of pace with its
 * reason, which applies at once. One tap keeps the usual pace. A change the profile itself could learn is suggested.
 */
export function pacingIndicator(
  controls: HTMLElement,
  o: ViewOptions,
  setPace: (ms: number) => void,
): (s: PacingSignal) => void {
  const p = o.profile;
  if (!p?.adapted) return () => undefined;
  const el = controls.createDiv({ cls: 'thoughtknot-pacing', attr: { role: 'status' } });
  el.hidden = true;
  const show = () => {
    const now = p.pacing.shown;
    setPace(PACE_MS[now.pacing]);
    el.empty();
    el.hidden = now.reason === null;
    if (now.reason === null) return;
    el.createSpan({
      text: word('profile.pacing.now', {
        pace: word(`profile.pace.${now.pacing}`),
        why: word(`profile.pacing.why.${now.reason}`),
      }),
    });
    button(el, word('profile.pacing.keep'), 'undo-2', () => {
      p.pacing.override();
      show();
    });
    const learned = p.pacing.suggestion();
    if (learned) p.suggest(learned);
  };
  return (s) => {
    if (p.shared()) return;
    const was = p.pacing.shown.pacing;
    if (p.pacing.signal(s).pacing !== was) show();
  };
}
