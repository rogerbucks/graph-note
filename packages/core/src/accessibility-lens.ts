// Accessibility as queryable constraints (editor spec §36, accessibility_queryable and accessibility_lenses_run). Each
// WCAG constraint is a WcagConstraint thing in the graph mesh: its criterion, what it checks and its least value. So a
// lens can ask which constraints there are, like any other thing. Each kind of check has a lens that runs it over the
// drawn elements and flags each element that fails, saying why. A constraint whose check has no lens is listed, never
// passed quietly.
//
// The host gives the drawn elements with their colours as painted, in `#rrggbb`, and whether each shows a focus ring.
import type { Graph } from '@thoughtknot/graph-spec';
import { contrastRatio, isTokenColour } from './theme-tokens.ts';

/** One drawn element as painted: its key, its colours, and for one that takes the focus whether a ring shows it. */
export interface DrawnElement {
  key: string;
  /** The colour behind it. */
  background: string;
  /** Its text's colour, when it has text. */
  text?: string;
  /** Its outline's colour, when it has one that must be seen. */
  line?: string;
  /** Whether it takes the keyboard's focus. */
  focusable?: boolean;
  /** Whether a focus ring shows when it has the focus. */
  focusRing?: boolean;
}

/** One WCAG constraint as the mesh records it. */
export interface WcagConstraint {
  id: string;
  criterion: string;
  /** What it checks: `text-contrast`, `line-contrast` or `focus-visible`. */
  check: string;
  /** The least contrast ratio, for a contrast check. */
  least?: number;
}

/** One element that fails a constraint, and why. */
export interface AccessibilityFlag {
  key: string;
  constraint: string;
  criterion: string;
  /** `contrast`, with the ratio found, or `no-focus-ring`. */
  why: 'contrast' | 'no-focus-ring';
  ratio?: number;
}

/** The WCAG 2.2 AA constraints the drawing is held to, as graph text a mesh records (§11's locked contrast). */
export const WCAG_CONSTRAINTS = `// graph: accessibility
(wcag_1_4_3:WcagConstraint {criterion: '1.4.3', check: 'text-contrast', least: 4.5}),
(wcag_1_4_11:WcagConstraint {criterion: '1.4.11', check: 'line-contrast', least: 3}),
(wcag_2_4_7:WcagConstraint {criterion: '2.4.7', check: 'focus-visible'})`;

/** The WCAG constraints a graph records, in the order written. */
export function constraintsOf(graph: Graph): WcagConstraint[] {
  return graph.labelled('WcagConstraint').map((id) => {
    const p = graph.p(id);
    const c: WcagConstraint = {
      id,
      criterion: typeof p.criterion === 'string' ? p.criterion : '',
      check: typeof p.check === 'string' ? p.check : '',
    };
    if (typeof p.least === 'number') c.least = p.least;
    return c;
  });
}

type Lens = (el: DrawnElement, c: WcagConstraint) => AccessibilityFlag | null;

const contrastLens =
  (part: 'text' | 'line'): Lens =>
  (el, c) => {
    const colour = el[part];
    if (!isTokenColour(colour) || !isTokenColour(el.background)) return null;
    const ratio = Math.round(contrastRatio(colour, el.background) * 100) / 100;
    return ratio < (c.least ?? 0)
      ? { key: el.key, constraint: c.id, criterion: c.criterion, why: 'contrast', ratio }
      : null;
  };

/** The lens that runs each kind of check, by the check's name. */
export const ACCESSIBILITY_LENSES: Readonly<Record<string, Lens>> = {
  'text-contrast': contrastLens('text'),
  'line-contrast': contrastLens('line'),
  'focus-visible': (el, c) =>
    el.focusable && !el.focusRing
      ? { key: el.key, constraint: c.id, criterion: c.criterion, why: 'no-focus-ring' }
      : null,
};

/** The constraints no lens can check: each is listed so it is never passed quietly. */
export function uncheckable(constraints: readonly WcagConstraint[]): WcagConstraint[] {
  return constraints.filter((c) => !Object.hasOwn(ACCESSIBILITY_LENSES, c.check));
}

/** The accessibility lens: every drawn element that fails a recorded constraint, constraint by constraint. */
export function accessibilityLens(
  elements: readonly DrawnElement[],
  constraints: readonly WcagConstraint[],
): AccessibilityFlag[] {
  return constraints.flatMap((c) => {
    const lens = ACCESSIBILITY_LENSES[c.check];
    return lens ? elements.flatMap((el) => lens(el, c) ?? []) : [];
  });
}
