// The error a block outside the document profile gives: its line, what is wrong, and the fix.
'use strict';

// ── the document profile reader (gql_profile.py) ───────────────────────────────────────────────
class ProfileError extends Error {
  constructor(line, message, fix) {
    super(`line ${line}: ${message} — ${fix}`);
    this.line = line;
    this.msg = message;
    this.fix = fix;
  }
}

module.exports = { ProfileError };
