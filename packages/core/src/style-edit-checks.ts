// Why a change to the style graph cannot be written (editor spec §2, §6, §7, §14, §15). These are the checks the style
// graph makes of its words. They are made before writing, so nothing written is read back as a fault. The writing
// itself is style-edit.ts.
import { STYLE } from './layout.ts';
import { centreRefusal, diagramTypeKnown, showFor, timelineRefusal, treeOnly } from './style-checks.ts';
import type { ArrowsWrite, DiagramWrite, LookWrite, NudgeWrite, ShowWrite, ShownWrite } from './style-edit.ts';
import {
  ARROWHEADS,
  DIAGRAM_TYPES,
  FORMATS,
  INLINE,
  LINES,
  NUDGE_WORDS,
  ON_OFF,
  STYLE_HUES,
  orList,
} from './style-graph.ts';
import { legendRefusal } from './untangle-saved.ts';
import { word } from './words.ts';

/** The switches a view saved as shown keeps, in the order they are written. */
export const SWITCH_KEYS = ['labels', 'hubs', 'groups', 'merge'] as const;

/** That `key` must be one of `among`, said as the style graph's check says it. */
export const mustBe = (key: string, among: readonly string[]) => word('styling.must-be', { key, among: orList(among) });

/** That a view needs a name. */
export const noViewName = () => word('editing.style.view-name');

/** Why a nudge cannot be written, or null. */
export function nudgeRefusal(n: NudgeWrite): string | null {
  if (!(NUDGE_WORDS as readonly string[]).includes(n.word)) return word('styling.nudge.four-words');
  if ((n.word === 'beside' || n.word === 'before') && !(n.thing && n.other))
    return word('styling.nudge.two-things', { word: n.word });
  if (n.word === 'group' && !(n.thing && n.group)) return word('styling.nudge.group');
  if (n.word === 'direction' && !STYLE.directions.includes(n.direction ?? ''))
    return word('editing.style.direction', { among: orList(STYLE.directions) });
  return null;
}

/** Why a look cannot be written, or null: the checks the style graph would make of its words, made before writing. */
export function lookRefusal(l: LookWrite): string | null {
  if (!l.view === !l.path) return word('editing.style.look-place');
  if ([l.thing, l.kind, l.link].filter(Boolean).length !== 1) return word('editing.style.look-target');
  if (!l.colour && !l.line && !l.format) return word('editing.style.look-change');
  if (l.colour && !STYLE_HUES.includes(l.colour)) return word('styling.look.colour-unknown', { written: l.colour });
  if (l.colour && !l.means) return word('editing.style.means', { colour: l.colour });
  if (l.line && !(LINES as readonly string[]).includes(l.line)) return mustBe('line', LINES);
  if (l.format && !(FORMATS as readonly string[]).includes(l.format)) return mustBe('format', FORMATS);
  return null;
}

/** Why how a view was shown cannot be written, or null. */
export function shownRefusal(s: ShownWrite): string | null {
  if (!s.view) return noViewName();
  if (![s.zoom, s.x, s.y].every(Number.isFinite) || s.zoom <= 0) return word('editing.style.shown-numbers');
  const f = s.frame;
  if (f && ![f.x, f.y, f.width, f.height].every(Number.isFinite)) return word('editing.style.frame');
  if (s.selected !== undefined && !s.selected) return word('editing.style.selected');
  const wrong = SWITCH_KEYS.find(
    (k) => s.switches?.[k] !== undefined && !(ON_OFF as readonly string[]).includes(s.switches[k] ?? ''),
  );
  if (wrong) return mustBe(wrong, ON_OFF);
  return legendRefusal(s.legend ?? []);
}

/** Why a property cannot be switched on or off, or null. */
export function showRefusal(s: ShowWrite): string | null {
  if (!s.property) return word('styling.show.property');
  if ([s.kind, s.thing, s.type].filter(Boolean).length !== 1) return showFor();
  if (!(INLINE as readonly string[]).includes(s.inline)) return mustBe('inline', INLINE);
  if (s.view === '') return noViewName();
  return null;
}

/** Why arrowheads cannot be hidden or shown so, or null. */
export function arrowsRefusal(a: ArrowsWrite): string | null {
  if (!(ARROWHEADS as readonly string[]).includes(a.arrowheads)) return mustBe('arrowheads', ARROWHEADS);
  if (a.type === '') return word('editing.style.type-name');
  if (a.view === '') return noViewName();
  return null;
}

/** Why a diagram type cannot be chosen so, or null. */
export function diagramRefusal(d: DiagramWrite): string | null {
  if (!diagramTypeKnown(d.type)) return mustBe('type', DIAGRAM_TYPES);
  if (d.relationship !== undefined && d.type !== 'tree') return treeOnly();
  if (d.relationship === '') return word('editing.style.type-name');
  const chosen = centreRefusal(d) ?? timelineRefusal(d);
  if (chosen) return chosen;
  if (d.view === '') return noViewName();
  return null;
}
