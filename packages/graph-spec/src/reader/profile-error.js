// The error a block outside the document profile gives: its line, what is wrong, and the fix.
'use strict';

// ── the document profile reader (gql_profile.py) ───────────────────────────────────────────────
// where the fix is one insertion, `at` is the character on the line it goes before (0-based)
class ProfileError extends Error {
  constructor(line, message, fix, at) {
    super(`line ${line}: ${message} — ${fix}`);
    this.line = line;
    this.msg = message;
    this.fix = fix;
    if (at !== undefined) this.at = at;
  }
}

module.exports = { ProfileError };
