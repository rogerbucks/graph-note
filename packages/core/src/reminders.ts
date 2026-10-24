// Reminders (editor spec §39, reminders_sent_elsewhere). A reminder is worked out from the graph: a thing with a `due`
// date that is not done. The profile styles it, gently or firmly, a chunk at a time. The engine never sends one. It
// only offers the list, as plain data. An outside tool the person set up sends it: a calendar, a mail rule, or a
// phone's own reminders.
import type { Graph } from '@thoughtknot/graph-spec';
import type { ProfileSettings } from './profiles.ts';

/** One reminder, as the engine offers it: the thing, its words, when it was due, and how firmly it is put. */
export interface Reminder {
  thing: string;
  says: string;
  due: string;
  style: 'gentle' | 'firm';
}

/** The things of a graph due by `today` (an ISO date) and not done, as data. */
export function dueThings(graph: Graph, today: string): { thing: string; says: string; due: string }[] {
  return [...graph.nodes]
    .flatMap(([id, [, p]]) => {
      const due = p.due;
      if (typeof due !== 'string' || due.slice(0, 10) > today || p.done === true || p.status === 'done') return [];
      const says = typeof p.name === 'string' ? p.name : typeof p.title === 'string' ? p.title : id;
      return [{ thing: id, says, due: due.slice(0, 10) }];
    })
    .sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : a.thing < b.thing ? -1 : 1));
}

/**
 * The reminders the engine offers an outside tool: those due, styled by the profile, the first chunk of them. None
 * when the profile turns reminders off. It only returns data: nothing here sends.
 */
export function remindersFor(graph: Graph, today: string, profile: ProfileSettings): Reminder[] {
  if (profile.reminders === 'off') return [];
  const style = profile.reminders;
  return dueThings(graph, today)
    .slice(0, profile.chunk)
    .map((d) => ({ ...d, style }));
}
