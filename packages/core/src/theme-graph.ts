// Themes in a graph of their own (editor spec §36, theme_graph and theme_links_meaningful). A theme graph holds Theme
// things and their ThemeRule things, apart from the knowledge. Several themes may live there. A theme that EXTENDS
// another takes the other's rules for anything it does not set itself, as CSS cascades. Each drawing combines one
// theme with the data.
//
// A rule says what it styles and which part: a kind (`applies`) or one thing (`thing`), and the `part`, such as its
// fill or outline. A rule naming a thing but no part is a problem. The knowledge graph never names a theme: the theme
// is chosen when it is drawn, by scope. There is a default, then the organisation's, the project's and the session's
// choice, the narrowest winning.
import type { Graph, World } from '@thoughtknot/graph-spec';

/** One rule of a theme: what it styles, which part, and the value. */
export interface ThemeRule {
  id: string;
  /** The theme that holds it. */
  theme: string;
  /** A kind it styles, or null. */
  applies: string | null;
  /** One thing it styles, by id, or null. */
  thing: string | null;
  part: string;
  value: string;
}

/** The labels a theme graph holds; none of them is knowledge. */
export const THEME_LABELS = ['Theme', 'ThemeRule'];

/** Whether a graph is a theme graph: it holds a Theme. */
export const isThemeGraph = (g: Graph): boolean => g.labelled('Theme').length > 0;

/** The knowledge of a world: every graph but its theme graphs. A query over it never meets a theme. */
export function knowledgeOf(world: World): World {
  return Object.fromEntries(Object.entries(world).filter(([, g]) => !isThemeGraph(g)));
}

/** A theme's own rules, as written, in order. */
function ownRules(themes: Graph, theme: string): ThemeRule[] {
  return themes
    .out(theme, 'HAS_RULE')
    .map((e) => e[2])
    .map((id) => {
      const p = themes.p(id);
      const text = (k: string): string | null => {
        const v = p[k];
        return typeof v === 'string' ? v : null;
      };
      return {
        id,
        theme,
        applies: text('applies'),
        thing: text('thing'),
        part: text('part') ?? '',
        value: text('value') ?? '',
      };
    });
}

/** The themes a theme takes rules from, itself first, then each it EXTENDS in turn. A loop is refused. */
export function themeChain(themes: Graph, theme: string): string[] {
  const chain: string[] = [];
  for (let at: string | undefined = theme; at !== undefined; at = themes.out(at, 'EXTENDS')[0]?.[2]) {
    if (chain.includes(at)) throw new Error(`refused: themes extend each other in a loop through ${at}`);
    if (!themes.has(at, 'Theme')) throw new Error(`refused: ${at} is not a theme`);
    chain.push(at);
  }
  return chain;
}

/** A theme's rules, its own first, then those it falls back on for what it does not set itself. */
export function themeRules(themes: Graph, theme: string): ThemeRule[] {
  const seen = new Set<string>(),
    out: ThemeRule[] = [];
  for (const t of themeChain(themes, theme))
    for (const r of ownRules(themes, t)) {
      const target = `${r.thing ?? ''}|${r.applies ?? ''}|${r.part}`;
      if (seen.has(target)) continue;
      seen.add(target);
      out.push(r);
    }
  return out;
}

/** A rule that cannot style: it names no part, or nothing to style. */
export interface RuleProblem {
  rule: string;
  why: 'no-part' | 'no-target';
}

/** The problems of a theme graph's rules: each that styles a thing or kind without saying which part. */
export function themeRuleProblems(themes: Graph): RuleProblem[] {
  return themes.labelled('ThemeRule').flatMap((id): RuleProblem[] => {
    const p = themes.p(id);
    if (typeof p.thing !== 'string' && typeof p.applies !== 'string') return [{ rule: id, why: 'no-target' }];
    return typeof p.part === 'string' && p.part ? [] : [{ rule: id, why: 'no-part' }];
  });
}

/**
 * The looks of each thing of a knowledge graph under one theme: by thing, each part's value. A rule for one thing
 * beats one for its kind. The graph is only read.
 */
export function drawWith(themes: Graph, theme: string, knowledge: Graph): Record<string, Record<string, string>> {
  const rules = themeRules(themes, theme);
  const out: Record<string, Record<string, string>> = {};
  for (const [id, [labels]] of knowledge.nodes) {
    const look: Record<string, string> = {};
    for (const r of rules)
      if (r.thing === null && r.applies !== null && labels.has(r.applies)) look[r.part] ??= r.value;
    for (const r of rules) if (r.thing === id) look[r.part] = r.value;
    if (Object.keys(look).length) out[id] = look;
  }
  return out;
}

/** Who has chosen a theme: a default, then by organisation, by project, and for this session alone. */
export interface ThemeChoices {
  default: string;
  organisation?: Readonly<Record<string, string>>;
  project?: Readonly<Record<string, string>>;
  session?: string | null;
}

/** Where a drawing is shown: its organisation and project, when it has them. */
export interface DrawScope {
  organisation?: string;
  project?: string;
}

/** The theme a drawing is shown in: the session's choice, else the project's, the organisation's, the default. */
export function themeFor(choices: ThemeChoices, scope: DrawScope): string {
  if (choices.session) return choices.session;
  const project = scope.project === undefined ? undefined : choices.project?.[scope.project];
  if (project) return project;
  const organisation = scope.organisation === undefined ? undefined : choices.organisation?.[scope.organisation];
  return organisation ?? choices.default;
}
