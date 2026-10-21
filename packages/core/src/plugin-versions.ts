// The versions of the plug-in interface (editor spec §43, plugin_point_versions; API-10, ARCH-12). The interface as a
// whole and each extension point carry a version, major.minor:
// - a minor version adds to what was there, so a plug-in built for an older minor still loads;
// - a major version changes it, so a plug-in built for another major is refused;
// - a plug-in may name the version of each point it uses, as `diagrams@1.0`. Only the points it uses are checked, so a
//   point that moves on refuses only the plug-ins that use it.
// A plug-in built for `1`, before minors, is read as built for `1.0`, and a point named with no version as `@1.0`.
import type { ExtensionPoint, ThoughtKnotPlugin } from './plugins.ts';

/** The version of the plug-in interface as a whole, as major.minor. */
export const PLUGIN_API = '1.1';

/** The version of each extension point, as major.minor. */
export const POINT_VERSIONS: Readonly<Record<ExtensionPoint, string>> = Object.freeze({
  exports: '1.0',
  theme: '1.0',
  storage: '1.0',
  commands: '1.0',
  panels: '1.0',
  sources: '1.0',
  steps: '1.0',
  ai: '1.0',
  diagrams: '1.0',
});

const VERSION = /^(\d+)(?:\.(\d+))?$/;

/** Whether a plug-in built for `wanted` runs on `have`: the same major, and a minor no higher. */
export function versionFits(wanted: string, have: string): boolean {
  const w = VERSION.exec(wanted),
    h = VERSION.exec(have);
  if (!w || !h) return false;
  return w[1] === h[1] && Number(w[2] ?? 0) <= Number(h[2] ?? 0);
}

/** A use a manifest names, as `diagrams` or `diagrams@1.0`: its point, and the version it was built for, if named. */
export function pointOf(use: string): { point: string; version?: string } {
  const at = use.indexOf('@');
  return at < 0 ? { point: use } : { point: use.slice(0, at), version: use.slice(at + 1) };
}

/**
 * The points `plugin` uses, each checked against `versions`: or why its manifest is refused. It is refused when:
 * - it was built for another version of the interface;
 * - it names a point that does not exist;
 * - a point's version does not fit, naming that point alone.
 */
export function pointsUsed(
  plugin: Pick<ThoughtKnotPlugin, 'api' | 'uses'>,
  versions: Readonly<Record<string, string>>,
): ExtensionPoint[] | string {
  if (!versionFits(plugin.api, PLUGIN_API))
    return `it was built for version ${plugin.api} of the interface, and this host has ${PLUGIN_API}`;
  const uses = plugin.uses.map(pointOf);
  const unknown = uses.filter((u) => !Object.hasOwn(versions, u.point)).map((u) => u.point);
  if (unknown.length) return `its manifest names extension points that do not exist: ${unknown.join(', ')}`;
  for (const { point, version = '1.0' } of uses)
    if (!versionFits(version, versions[point] ?? ''))
      return `it was built for ${point}@${version}, and this host has ${point}@${versions[point]}`;
  return uses.map((u) => u.point as ExtensionPoint);
}
