#!/usr/bin/env node
// The code scan, on every change before it merges (#849). GitHub's code scanning stops a pull request only for a
// security problem the pull request adds. One already in the code, or one a newer scan finds, waits until the nightly
// stops on it. So CI runs the same scan on the whole code and fails on any security problem it finds at all.
//
// The repository is public, so the log names each kind of problem and how many, never the file or the line. To see
// where, run the scan yourself (RELEASING.md, "Security alerts, every release"), or open the Security tab.
//
// Usage: node scripts/code-scan.mjs <folder of SARIF files>
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The security problems in one SARIF run: each result whose rule has a security severity. */
export function securityFindings(sarif) {
  const found = [];
  for (const run of sarif?.runs ?? []) {
    const rules = new Map();
    for (const tool of [run.tool?.driver, ...(run.tool?.extensions ?? [])])
      for (const rule of tool?.rules ?? []) rules.set(rule.id, rule);
    for (const result of run.results ?? []) {
      const severity = Number(rules.get(result.ruleId)?.properties?.['security-severity']);
      if (Number.isFinite(severity) && result.suppressions?.length !== 1) found.push({ rule: result.ruleId, severity });
    }
  }
  return found;
}

/** Each kind of problem with how many there are, most first: what the log may say. */
export function tally(found) {
  const counts = new Map();
  for (const f of found) counts.set(f.rule, (counts.get(f.rule) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function main([folder]) {
  if (!folder) {
    console.error('usage: node scripts/code-scan.mjs <folder of SARIF files>');
    return 2;
  }
  const files = readdirSync(folder).filter((f) => f.endsWith('.sarif'));
  if (!files.length) {
    console.error(`code-scan: no SARIF file in ${folder}, so nothing was checked`);
    return 1;
  }
  const found = files.flatMap((f) => securityFindings(JSON.parse(readFileSync(join(folder, f), 'utf8'))));
  if (!found.length) {
    console.log('code-scan: no security problem found');
    return 0;
  }
  for (const [rule, n] of tally(found)) console.error(`code-scan: ${n} × ${rule}`);
  console.error(`code-scan: ${found.length} security problems. Fix each at its cause, with a test and a rule.`);
  return 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
