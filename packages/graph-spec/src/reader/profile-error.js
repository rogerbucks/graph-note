// The error a block outside the document profile gives: its line, what is wrong, the fix, and its stable code.
'use strict';

// ── the document profile reader (gql_profile.py) ───────────────────────────────────────────────
// Where the fix is one insertion, `at` is the character on the line it goes before (0-based). `code` is the problem's
// stable code (editor spec §42, problem_codes). It is given in problem-codes.json and is the same from the Python
// reader.
class ProfileError extends Error {
  constructor(line, message, fix, at, code) {
    super(`line ${line}: ${message} — ${fix}`);
    this.line = line;
    this.msg = message;
    this.fix = fix;
    if (at !== undefined) this.at = at;
    if (code !== undefined) this.code = code;
  }
}

module.exports = { ProfileError };
