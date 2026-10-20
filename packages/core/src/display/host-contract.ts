// The one contract every host of the display layer is held to (editor spec §41, host_contract_published; §43,
// hosts_pass_contract). It is what `DisplayHost` promises, as checks any host runs against its own adapter code. That holds
// for Obsidian's, the browser page's, the standalone app's and VS Code's alike. The checks need no test framework. Each
// one throws when the host breaks the promise, so a host's tests run them with whatever runner it has. A host lets the
// checks see what it showed through a probe, as only it knows where its notices and menus go.
import type { DisplayHost, Host, MenuEntry } from './host.ts';

/**
 * Each version of the host interface, with a digest of how `public-api.json` declares it then. The digest is the first
 * 16 hex characters of the SHA-256 of its `./display/host` entry, as JSON. A change to `DisplayHost` changes the
 * digest. Then test/lib-public-api.test.js fails until a new version is added here (risk API-3).
 */
export const HOST_CONTRACT_VERSIONS: readonly (readonly [version: number, digest: string])[] = [
  [3, 'efae3cb1b2853709'],
];

/** The version of the host interface these checks hold a host to: the last one recorded above. */
export const HOST_CONTRACT_VERSION: number = HOST_CONTRACT_VERSIONS.at(-1)?.[0] ?? 0;

/** A menu row as the person sees it: its title, and whether it is ticked or a warning. */
export type MenuRowSeen = { title: string; checked?: boolean; warning?: boolean } | 'separator';

/** What a host lets the checks see of what it showed. */
export interface HostProbe {
  /** The document the host draws in. */
  doc: Document;
  /** A new element of that document, empty and on the page, for an icon to be drawn into. */
  element: () => HTMLElement;
  /** The messages its notices have shown, in order, as the person reads them. */
  notices: () => string[];
  /** The rows of the last menu it showed, in order, or null when it has shown none. */
  lastMenu: () => MenuRowSeen[] | null;
  /** Chooses the row of the last menu titled `title`, as the person would. */
  choose: (title: string) => void;
}

/** A host for one check: a fresh adapter, and its probe. */
export interface HostUnderTest {
  host: DisplayHost;
  probe: HostProbe;
}

/** One check of the contract: what it holds a host to, and the run that throws when the host breaks it. */
export interface ContractCheck {
  name: string;
  run: () => void | Promise<void>;
}

/** Fails a check with what was wanted and what the host did. */
function fail(name: string, wanted: string, got: unknown): never {
  throw new Error(`${name}: wanted ${wanted}, got ${JSON.stringify(got)}`);
}

const ROWS: MenuEntry[] = [
  { title: 'Fit', icon: 'maximize', onClick: () => {} },
  'separator',
  { title: 'Left to right', icon: 'arrow-right', checked: true, onClick: () => {} },
  { title: 'Remove', icon: 'trash', warning: true, onClick: () => {} },
];

/** The rows the person should see for `entries`. */
const seen = (entries: MenuEntry[]): MenuRowSeen[] =>
  entries.map((e) =>
    e === 'separator'
      ? e
      : { title: e.title, ...(e.checked !== undefined && { checked: e.checked }), ...(e.warning && { warning: true }) },
  );

/** Every check of the contract, each run on a fresh host from `make`. */
export function hostContract(make: () => HostUnderTest): ContractCheck[] {
  return [
    {
      name: 'an icon is drawn into its element, once, whether the host knows its name or not',
      run: () => {
        const { host, probe } = make();
        const el = probe.element();
        host.icon(el, 'zoom-in');
        const once = el.childNodes.length;
        host.icon(el, 'zoom-in');
        if (el.childNodes.length !== once)
          fail('icon', `${once} child nodes after drawing again`, el.childNodes.length);
        host.icon(el, 'no-such-icon-anywhere');
      },
    },
    {
      name: 'the phone test is a true or false, asked each time',
      run: () => {
        const { host } = make();
        for (let i = 0; i < 2; i++) {
          const phone: unknown = host.isPhone();
          if (typeof phone !== 'boolean') fail('isPhone', 'a boolean', phone);
        }
      },
    },
    {
      name: 'a notice shows its message as text, as given, markup and all',
      run: () => {
        const { host, probe } = make();
        const message = 'Saved <b>A & B</b>';
        host.notice(message);
        const shown = probe.notices();
        if (shown[shown.length - 1] !== message) fail('notice', JSON.stringify(message), shown);
      },
    },
    {
      name: 'a menu shows its rows in order, with their lines, ticks and warnings',
      run: () => {
        const { host, probe } = make();
        host.menu(ROWS, { x: 10, y: 20 }, probe.doc);
        const want = seen(ROWS);
        const got = probe.lastMenu();
        if (JSON.stringify(got) !== JSON.stringify(want)) fail('menu', JSON.stringify(want), got);
      },
    },
    {
      name: 'choosing a menu row runs its action once, and no other row’s',
      run: () => {
        const { host, probe } = make();
        const ran: string[] = [];
        const rows: MenuEntry[] = ['Fit', 'Remove'].map((title) => ({
          title,
          icon: 'circle-dot',
          onClick: () => ran.push(title),
        }));
        host.menu(rows, { x: 0, y: 0 }, probe.doc);
        probe.choose('Remove');
        if (ran.join() !== 'Remove') fail('menu', '["Remove"]', ran);
      },
    },
    {
      name: 'the style policy is said as true or false, or left unsaid',
      run: () => {
        const { host } = make();
        if (host.noInlineStyle !== undefined && typeof host.noInlineStyle !== 'boolean')
          fail('noInlineStyle', 'a boolean or nothing', host.noInlineStyle);
      },
    },
    {
      name: 'the language is a language tag, or left unsaid',
      run: () => {
        const { host } = make();
        if (host.language === undefined) return;
        const tag: unknown = host.language();
        let known = false;
        try {
          known = typeof tag === 'string' && Intl.getCanonicalLocales(tag).length === 1;
        } catch {
          known = false;
        }
        if (!known) fail('language', 'a language tag such as en-GB', tag);
      },
    },
    {
      name: 'the direction is ltr or rtl, or left unsaid',
      run: () => {
        const { host } = make();
        if (host.direction === undefined) return;
        const way: unknown = host.direction();
        if (way !== 'ltr' && way !== 'rtl') fail('direction', 'ltr or rtl', way);
      },
    },
  ];
}

/** What a whole host lets the checks see: what its display showed, the links it opened, and a way to keep a secret. */
export interface ServicesProbe extends HostProbe {
  /** The target of each link the host opened, in order. */
  opened: () => string[];
  /** Keeps `secret` under `name`, as the person would in the host's own secret storage. */
  keepSecret: (name: string, secret: string) => void;
}

/** A whole host for one check: a fresh one, and its probe. */
export interface ServicesUnderTest {
  host: Host;
  probe: ServicesProbe;
}

/**
 * Every check of the whole host interface, each run on a fresh host from `make`: the display's, then its links,
 * settings, secrets and notes. The notes are held to the storage contract (storage-contract.ts).
 */
export function hostServicesContract(make: () => ServicesUnderTest): ContractCheck[] {
  return hostContract(() => {
    const { host, probe } = make();
    return { host: host.display, probe };
  });
}
