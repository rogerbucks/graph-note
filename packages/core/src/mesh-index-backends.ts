// Where the mesh's local store keeps its rows (mesh-index.ts): in memory, or in SQLite inside the process through an
// engine the host hands in. Both answer each read alike, in the order the rows were put (embedded_backends).
import type { GroupedBy } from './scale-groups.ts';
import type { MeshBackend, NoteRows, Span } from './mesh-index-rows.ts';

/** The index kept in memory. */
export function memoryBackend(): MeshBackend {
  const kept = new Map<string, NoteRows>();
  return {
    kind: 'memory',
    put: (rows) => void kept.set(rows.note, rows),
    drop: (note) => void kept.delete(note),
    version: (note) => kept.get(note)?.version ?? null,
    notes: () => [...kept.keys()].sort(),
    groups: (note) => ({ groups: kept.get(note)?.groups ?? [], between: kept.get(note)?.between ?? [] }),
    things: (note, groups) => {
      const wanted = new Set(groups);
      return (kept.get(note)?.things ?? []).filter((t) => wanted.has(t.group));
    },
    links: (note) => kept.get(note)?.links ?? [],
  };
}

/** A SQLite engine in the process: runs one statement with its parameters and gives back its rows. */
export interface SqlEngine {
  run(sql: string, params?: readonly (string | number | null)[]): Record<string, unknown>[];
}

const TABLES = [
  'CREATE TABLE IF NOT EXISTS notes (note TEXT PRIMARY KEY, version TEXT NOT NULL)',
  `CREATE TABLE IF NOT EXISTS things (note TEXT, graph TEXT, place INTEGER, key TEXT, kind TEXT, text TEXT,
     grp TEXT, props TEXT, line INTEGER, end_line INTEGER)`,
  `CREATE TABLE IF NOT EXISTS links (note TEXT, graph TEXT, n INTEGER, place INTEGER, src TEXT, type TEXT, dst TEXT,
     src_grp TEXT, dst_grp TEXT, line INTEGER, end_line INTEGER)`,
  `CREATE TABLE IF NOT EXISTS thing_groups (note TEXT, graph TEXT, place INTEGER, id TEXT, label TEXT, by TEXT,
     things INTEGER, links INTEGER)`,
  'CREATE TABLE IF NOT EXISTS group_links (note TEXT, graph TEXT, place INTEGER, src TEXT, dst TEXT, links INTEGER)',
  'CREATE INDEX IF NOT EXISTS things_by_group ON things (note, grp)',
];

const str = (v: unknown): string => String(typeof v === 'string' || typeof v === 'number' ? v : '');
const num = (v: unknown): number => Number(v ?? 0);
const span = (r: Record<string, unknown>): Span | null =>
  r['line'] === null || r['line'] === undefined ? null : { line: num(r['line']), end: num(r['end_line']) };

/** The index kept in SQLite, through `engine`. Rows come back in the order they were put. */
export function sqliteBackend(engine: SqlEngine): MeshBackend {
  for (const t of TABLES) engine.run(t);
  const drop = (note: string): void => {
    for (const t of ['notes', 'things', 'links', 'thing_groups', 'group_links'])
      engine.run(`DELETE FROM ${t} WHERE note = ?`, [note]);
  };
  return {
    kind: 'sqlite',
    put(rows) {
      drop(rows.note);
      engine.run('INSERT INTO notes VALUES (?, ?)', [rows.note, rows.version]);
      rows.things.forEach((t, i) =>
        engine.run('INSERT INTO things VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [
          t.note,
          t.graph,
          i,
          t.key,
          t.kind,
          t.text,
          t.group,
          t.props,
          t.span?.line ?? null,
          t.span?.end ?? null,
        ]),
      );
      rows.links.forEach((l, i) =>
        engine.run('INSERT INTO links VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [
          l.note,
          l.graph,
          l.n,
          i,
          l.from,
          l.type,
          l.to,
          l.fromGroup,
          l.toGroup,
          l.span?.line ?? null,
          l.span?.end ?? null,
        ]),
      );
      rows.groups.forEach((g, i) =>
        engine.run('INSERT INTO thing_groups VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [
          g.note,
          g.graph,
          i,
          g.id,
          g.label,
          g.by,
          g.things,
          g.links,
        ]),
      );
      rows.between.forEach((b, i) =>
        engine.run('INSERT INTO group_links VALUES (?, ?, ?, ?, ?, ?)', [b.note, b.graph, i, b.from, b.to, b.links]),
      );
    },
    drop,
    version: (note) => {
      const [r] = engine.run('SELECT version FROM notes WHERE note = ?', [note]);
      return r ? str(r['version']) : null;
    },
    notes: () => engine.run('SELECT note FROM notes ORDER BY note').map((r) => str(r['note'])),
    groups: (note) => ({
      groups: engine.run('SELECT * FROM thing_groups WHERE note = ? ORDER BY place', [note]).map((r) => ({
        note: str(r['note']),
        graph: str(r['graph']),
        id: str(r['id']),
        label: str(r['label']),
        by: str(r['by']) as GroupedBy,
        things: num(r['things']),
        links: num(r['links']),
      })),
      between: engine.run('SELECT * FROM group_links WHERE note = ? ORDER BY place', [note]).map((r) => ({
        note: str(r['note']),
        graph: str(r['graph']),
        from: str(r['src']),
        to: str(r['dst']),
        links: num(r['links']),
      })),
    }),
    things: (note, groups) =>
      groups.length === 0
        ? []
        : engine
            .run(
              `SELECT * FROM things WHERE note = ? AND grp IN (${groups.map(() => '?').join(', ')}) ORDER BY place`,
              [note, ...groups],
            )
            .map((r) => ({
              note: str(r['note']),
              graph: str(r['graph']),
              key: str(r['key']),
              kind: str(r['kind']),
              text: str(r['text']),
              group: str(r['grp']),
              props: str(r['props']),
              span: span(r),
            })),
    links: (note) =>
      engine.run('SELECT * FROM links WHERE note = ? ORDER BY place', [note]).map((r) => ({
        note: str(r['note']),
        graph: str(r['graph']),
        n: num(r['n']),
        from: str(r['src']),
        type: str(r['type']),
        to: str(r['dst']),
        fromGroup: str(r['src_grp']),
        toGroup: str(r['dst_grp']),
        span: span(r),
      })),
  };
}
