// The one contract every note storage backend is held to (editor spec §41, storage_contract). It holds an Obsidian
// vault, a plain folder and a VS Code workspace alike, and any backend with layers on, such as encryption or history.
// The checks need no test framework. Each one throws when the backend breaks the promise, so a backend's tests run them
// with whatever runner they have.
import type { NoteStorage, WriteOutcome } from './note-storage.ts';
import { changeNote, REFUSED } from './note-storage.ts';

/** One check of the contract: what it holds a backend to, and the run that throws when the backend breaks it. */
export interface StorageCheck {
  name: string;
  run: () => Promise<void>;
}

/** Fails a check with what was wanted and what the backend did. */
function fail(name: string, wanted: string, got: unknown): never {
  throw new Error(`${name}: wanted ${wanted}, got ${JSON.stringify(got)}`);
}

/** The version a change left, or a failed check. */
function made(name: string, outcome: WriteOutcome): string | null {
  if (!outcome.ok) fail(name, 'the change made', outcome);
  return outcome.version;
}

/** That a change was refused for `reason`, with the note as it now is. */
function refused(name: string, outcome: WriteOutcome, reason: string, text: string | null): void {
  if (outcome.ok || outcome.reason !== reason || (outcome.current?.text ?? null) !== text)
    fail(name, `refused as "${reason}", with the note as ${JSON.stringify(text)}`, outcome);
}

/** Texts a note must keep byte for byte: line endings, spaces at the end of a line, letters of every script, nothing. */
const TEXTS = [
  '',
  'one line, no ending',
  'a\r\nb\r\n',
  'trailing  \n\n\n',
  'ünïcödé · 漢字 · 😀\n',
  '```gql\n(a)\n```\n',
];

/** Paths no backend may write: outside the store, in a hidden folder, or not a note. */
const OUTSIDE = [
  '../out.md',
  '/root.md',
  '~/home.md',
  '.hidden/app.md',
  'a/../b.md',
  'notes.txt',
  'a\\b.md',
  'C:/drive.md',
  'a.md:stream.md',
  '',
];

/** A note named as people name them: a `+`, a `?` and dots that end the name. Mac and Linux hold it, and so must we. */
const ODD_NAME = '+Contacts as a single source of truth/Best Contact manager for gmail? I want to get con....md';

/** Every check of the contract, each run on a fresh, empty backend from `make`. */
export function storageContract(make: () => NoteStorage | Promise<NoteStorage>): StorageCheck[] {
  return [
    {
      name: 'an empty store lists no note, and reads none',
      run: async () => {
        const s = await make();
        const listed = await s.list();
        if (listed.length) fail('list', 'no notes', listed);
        const read = await s.read('Nothing here.md');
        if (read !== null) fail('read', 'null', read);
      },
    },
    {
      name: 'a note reads back byte for byte as it was written',
      run: async () => {
        const s = await make();
        for (const [i, text] of TEXTS.entries()) {
          const version = made('write', await s.write(`n${i}.md`, text));
          const read = await s.read(`n${i}.md`);
          if (read?.text !== text) fail('read', JSON.stringify(text), read);
          if (read.version !== version) fail('version', `the version the write gave, ${version}`, read.version);
        }
      },
    },
    {
      name: 'every note is listed by its path, sorted, folders and all',
      run: async () => {
        const s = await make();
        for (const path of ['b.md', 'A folder/c.md', 'a.md', 'A folder/deeper/d.md'])
          made('write', await s.write(path, path));
        const listed = await s.list();
        const want = ['A folder/c.md', 'A folder/deeper/d.md', 'a.md', 'b.md'];
        if (JSON.stringify(listed) !== JSON.stringify(want)) fail('list', JSON.stringify(want), listed);
      },
    },
    {
      name: 'a write made against the version read is kept, and one against an older version is refused',
      run: async () => {
        const s = await make();
        const first = made('write', await s.write('n.md', 'first'));
        const second = made('write', await s.write('n.md', 'second', { expected: first }));
        if (second === first) fail('version', 'a new version for a new text', second);
        refused('write', await s.write('n.md', 'lost', { expected: first }), REFUSED.changed, 'second');
        if ((await s.read('n.md'))?.text !== 'second') fail('read', '"second"', await s.read('n.md'));
      },
    },
    {
      name: 'a write that expects no note is refused where one is, and makes it where none is',
      run: async () => {
        const s = await make();
        made('write', await s.write('new.md', 'made', { expected: null }));
        refused('write', await s.write('new.md', 'again', { expected: null }), REFUSED.exists, 'made');
        refused('write', await s.write('gone.md', 'x', { expected: 'some version' }), REFUSED.missing, null);
        if ((await s.read('gone.md')) !== null) fail('read', 'null', await s.read('gone.md'));
      },
    },
    {
      name: 'a note removed is gone, and a removal against an older version is refused',
      run: async () => {
        const s = await make();
        const first = made('write', await s.write('n.md', 'first'));
        made('write', await s.write('n.md', 'second'));
        refused('remove', await s.remove('n.md', { expected: first }), REFUSED.changed, 'second');
        const now = await s.read('n.md');
        made('remove', await s.remove('n.md', { expected: now?.version ?? null }));
        if ((await s.read('n.md')) !== null) fail('read', 'null', await s.read('n.md'));
        if ((await s.list()).length) fail('list', 'no notes', await s.list());
        refused('remove', await s.remove('n.md'), REFUSED.missing, null);
      },
    },
    {
      name: 'a note changed is written from the note as it is, and one not there is refused, never made',
      run: async () => {
        const s = await make();
        made('write', await s.write('n.md', 'one'));
        const done = await changeNote(s, 'n.md', (text) => `${text}, two`);
        if (!done.ok || done.text !== 'one, two') fail('change', 'the note changed to "one, two"', done);
        const read = await s.read('n.md');
        if (read?.text !== 'one, two' || read.version !== done.version)
          fail('read', 'the change and its version', read);
        refused('change', await changeNote(s, 'gone.md', (text) => `${text}!`), REFUSED.missing, null);
        if ((await s.list()).join() !== 'n.md') fail('list', 'n.md alone', await s.list());
      },
    },
    {
      name: 'a note named with a `+`, a `?` and dots before `.md` is written, listed, read and removed',
      run: async () => {
        const s = await make();
        made('write', await s.write(ODD_NAME, 'odd'));
        if ((await s.list()).join() !== ODD_NAME) fail('list', ODD_NAME, await s.list());
        const read = await s.read(ODD_NAME);
        if (read?.text !== 'odd') fail('read', '"odd"', read);
        made('remove', await s.remove(ODD_NAME));
        if ((await s.list()).length) fail('list', 'no notes', await s.list());
      },
    },
    {
      name: 'a path outside the store, in a hidden folder or not a note is refused, and nothing is written',
      run: async () => {
        const s = await make();
        for (const path of OUTSIDE) {
          for (const call of [() => s.write(path, 'x'), () => s.read(path), () => s.remove(path)]) {
            let threw = false;
            try {
              await call();
            } catch {
              threw = true;
            }
            if (!threw) fail(JSON.stringify(path), 'an error, as the path is refused', 'no error');
          }
        }
        if ((await s.list()).length) fail('list', 'no notes', await s.list());
      },
    },
  ];
}
