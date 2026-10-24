// A process transition that changes how deep the view goes (editor spec §32, phase_shifts_altitude). The spec calls it
// provisional, so it is a part that can be swapped or removed. The default part reads an `altitude` on the transition.
// With no part, or a transition that names none, walking a transition moves the state and keeps the depth.

/** A transition as the walk reads it: where it starts and ends, and its properties. */
export interface WalkedTransition {
  from: string;
  to: string;
  props: Readonly<Record<string, unknown>>;
}

/** Where a view is: its state and its altitude. */
export interface PhaseView {
  state: string;
  level: number;
}

/** The replaceable part: the altitude a transition moves the view to, or null to keep it. */
export interface PhaseAltitudePart {
  levelFor(transition: WalkedTransition, level: number): number | null;
}

/** The default part: a transition's own `altitude`, when it is a number. */
export const transitionAltitude: PhaseAltitudePart = {
  levelFor: (t) => (typeof t.props.altitude === 'number' ? t.props.altitude : null),
};

/** The view after walking a transition. Without a part, the depth stays as it was. */
export function walkTransition(
  view: PhaseView,
  transition: WalkedTransition,
  part: PhaseAltitudePart | null = transitionAltitude,
): PhaseView {
  if (transition.from !== view.state)
    throw new Error(`refused: the transition starts at ${transition.from}, not ${view.state} (editor spec §32)`);
  const level = part ? part.levelFor(transition, view.level) : null;
  return { state: transition.to, level: level ?? view.level };
}
