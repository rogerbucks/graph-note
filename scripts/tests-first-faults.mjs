// Reasons for faults (spec §12, tests_first). A new test that failed at its own commit is kept in the record as not
// replayed. `--excuse --fault` keeps the reason it did, in test/seen-failing/. Records and reasons are kept by
// scripts/tests-first-records.mjs; the command is scripts/tests-first.mjs.
import { EXCUSALS, RecordsError, excusalName, exceptionsIn, keep, readRecords } from './tests-first-records.mjs';

/** Each commit at which the records hold a fault of `test` in `file`, with the file's entry in that commit's record. */
function faultsOf(repo, file, test) {
  return [...readRecords(repo).commits.values()].flatMap((r) =>
    r.files.filter((f) => f.file === file && (f.faults ?? []).some((x) => x.test === test)).map((f) => [r.commit, f]),
  );
}

/**
 * Keeps the reason `test`, in the test file `file`, failed at its own commit and so could not be replayed. `evidence`
 * says why, and which commit fixed it. Gives the file's path from the root. The reason names every commit at which
 * the records hold that fault. So a later fault of the same test, recorded after, is not excused by it. Only a fault of
 * a file that was replayed is excused. If no test of a file passed at its own commit, the file was not replayed at
 * all. A reason would not make it so. A reason for any other test is refused. A reason kept already is replaced
 * only when `force` is given.
 */
export function excuseFault(repo, file, test, evidence, force = false) {
  const rel = `${EXCUSALS}/${excusalName(file, test)}`;
  const held = faultsOf(repo, file, test);
  const commits = held
    .filter(([, f]) => !f.notReplayed)
    .map(([commit]) => commit)
    .sort(); // sorted, so the reason file is the same wherever it is written
  if (held.length && !commits.length)
    throw new RecordsError(
      `${rel}: no test in ${file} passes at its own commit, so the file was not replayed, and a reason would not make it so`,
    );
  if (!commits.length) throw new RecordsError(`${rel}: the records hold no fault of "${test}" in ${file}`);
  return keep(repo, file, test, { seen_failing_first: false, fault: true, commits, evidence }, force);
}

/**
 * The commits a fault reason names that the records do not hold as a fault of its test. Each is given as
 * `file :: test @ commit`: a wrong commit, or one a rebase has replaced. Empty when every reason is as it should be.
 */
export function faultReasonsWithoutFault(repo) {
  return Object.entries(exceptionsIn(repo)).flatMap(([file, tests]) =>
    Object.entries(tests)
      .filter(([, reason]) => reason.fault === true)
      .flatMap(([test, reason]) => {
        const held = faultsOf(repo, file, test)
          .filter(([, f]) => !f.notReplayed)
          .map(([commit]) => commit);
        return reason.commits.filter((c) => !held.includes(c)).map((c) => `${file} :: ${test} @ ${c}`);
      }),
  );
}
