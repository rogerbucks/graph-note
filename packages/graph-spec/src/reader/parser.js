// The parser of one data block's statement: MATCH, INSERT (or the data shortcut) and SET (gql_profile.py).
'use strict';

const { GTime } = require('../values/times.js');
const { ProfileError } = require('./profile-error.js');
const { unquote, utcNaive } = require('./tokens.js');

/** A node's id written as a value that is not text (§3, req:3.id-is-text): the missing comma's retry keeps it, never
 * taking it for a pattern that is not one. */
class IdNotTextError extends ProfileError {}

class Parser {
  constructor(t) {
    this.t = t;
    this.i = 0;
    // commas: [line, at] for each missing comma read in (§3): the line it is missing from, and where in the block the
    // code on that line ends, which is where it is written in
    this.commas = [];
  }
  peek(k = 0) {
    const last = this.t[this.t.length - 1];
    return this.t[this.i + k] || ['end', '', last ? last[2] : 1, '', last ? last[4] : 0];
  }
  line() {
    return this.peek()[2];
  }
  take(kind, text) {
    const tok = this.peek();
    if ((kind && tok[0] !== kind) || (text && tok[1] !== text))
      throw new ProfileError(
        tok[2],
        `expected '${text || kind}', found '${tok[1] || 'the end'}'`,
        'keep to the document profile (§3)',
        undefined,
        'GN201',
      );
    this.i++;
    return tok;
  }
  at(kind, text) {
    const tok = this.peek();
    return (!kind || tok[0] === kind) && (!text || tok[1] === text);
  }
  name() {
    const [k, t, n, raw] = this.peek();
    if (k === 'id' || k === 'kw') {
      this.i++;
      return raw;
    }
    throw new ProfileError(
      n,
      `expected a name, found '${t || 'the end'}'`,
      'keep to the document profile (§3)',
      undefined,
      'GN202',
    );
  }
  value() {
    const [k, t, n] = this.peek();
    if (k === 'str') {
      this.i++;
      return unquote(t);
    }
    if (k === 'num') {
      this.i++;
      return Number(t);
    }
    if (k === 'kw' && (t === 'TRUE' || t === 'FALSE')) {
      this.i++;
      return t === 'TRUE';
    }
    if (k === 'kw' && t === 'DATE') {
      this.i++;
      const s = unquote(this.take('str')[1]);
      if (!/^\d{4}-\d\d-\d\d$/.test(s) || isNaN(Date.parse(s + 'T00:00:00Z')))
        throw new ProfileError(n, `'${s}' is not a date`, "write DATE 'YYYY-MM-DD'", undefined, 'GN203');
      return new GTime('date', s);
    }
    if (k === 'kw' && t === 'DATETIME') {
      this.i++;
      const s = unquote(this.take('str')[1]);
      return new GTime('datetime', utcNaive(s, n));
    }
    throw new ProfileError(
      n,
      `'${t || 'nothing'}' is not a value in the profile`,
      "use 'text', a number, TRUE, FALSE, DATE '…' or DATETIME '…' — no lists, no expressions",
      undefined,
      'GN207',
    );
  }
  /** Refuses a node's id written as a value that is not text — a number, TRUE, FALSE, DATE '…' or DATETIME '…' — with
   * the fix that quotes it (§3, req:3.id-is-text). */
  textId() {
    const [k, t, n, raw] = this.peek(),
      next = this.peek(1);
    let written, quoted;
    if (k === 'num' || (k === 'kw' && (t === 'TRUE' || t === 'FALSE'))) [written, quoted] = [raw, `'${raw}'`];
    else if (k === 'kw' && (t === 'DATE' || t === 'DATETIME') && next[0] === 'str')
      [written, quoted] = [`${raw} ${next[1]}`, next[1]];
    else return;
    throw new IdNotTextError(
      n,
      `id ${written} is not text`,
      `write id: ${quoted} — a node's id is always text (§3)`,
      undefined,
      'GN208',
    );
  }
  props(node = false) {
    const out = {};
    if (!this.at('p', '{')) return out;
    this.take('p', '{');
    while (!this.at('p', '}')) {
      const key = this.name();
      this.take('p', ':');
      if (node && key === 'id') this.textId();
      out[key] = this.value();
      if (!this.at('p', '}')) this.take('p', ',');
    }
    this.take('p', '}');
    return out;
  }
  node() {
    const n = this.take('p', '(')[2],
      v = this.name(),
      labels = [];
    while (this.at('p', ':')) {
      this.take('p', ':');
      labels.push(this.name());
    }
    const props = this.props(true);
    this.take('p', ')');
    return { v, labels, props, line: n };
  }
  path() {
    const nodes = [this.node()],
      rels = [];
    while (this.at('p', '-')) {
      this.take('p', '-');
      this.take('p', '[');
      // a type written without its colon is read here and resolved by the store, which knows the graph's types
      // (§3, req:3.bare-link-type)
      const bare = !this.at('p', ':');
      if (!bare) this.take('p', ':');
      const [, , line, raw, end] = this.peek();
      const type = this.name();
      const props = this.props();
      this.take('p', ']');
      this.take('arrow');
      // at: where the type begins in the block, where a bare one's colon is written in
      rels.push({ type, props, bare, line, at: end - raw.length });
      nodes.push(this.node());
    }
    return [nodes, rels];
  }
  statement() {
    const matches = [],
      paths = [],
      sets = [];
    while (this.at('kw', 'MATCH')) {
      this.take('kw', 'MATCH');
      matches.push(this.node());
      while (this.at('p', ',')) {
        this.take('p', ',');
        matches.push(this.node());
      }
    }
    if (!matches.length && this.at('p', '(')) {
      /* the data shortcut (§3): a block that only lists things and links means INSERT */
    } else if (!this.at('kw', 'SET')) this.take('kw', 'INSERT'); // a SET alone names its nodes, by MATCH or by id (6 Oct 2026)
    if (!this.at('kw', 'SET')) {
      paths.push(this.path());
      for (;;) {
        if (this.at('p', ',')) {
          this.take('p', ',');
          paths.push(this.path());
          continue;
        }
        // §3, 7 Oct 2026: a complete pattern starting on a later line, with no comma before it, is read as if the comma were there
        const prev = this.t[this.i - 1];
        if (this.at('p', '(') && prev && this.line() > prev[2]) {
          const at = this.i;
          try {
            const p = this.path();
            this.commas.push([prev[2], prev[4]]); // the token before ends its line's code: a comment after code is refused
            paths.push(p);
            continue;
          } catch (e) {
            // its id refused, never hidden as "unexpected '('" (review of #49)
            if (!(e instanceof ProfileError) || e instanceof IdNotTextError) throw e;
            this.i = at;
          }
        }
        break;
      }
    }
    if (this.at('kw', 'SET')) {
      this.take('kw', 'SET');
      for (;;) {
        const n = this.line(),
          v = this.name();
        this.take('p', '.');
        const key = this.name();
        // §3, req:3.set-keeps-id: whatever the value — a used id, a fresh one, or the node's own
        if (key === 'id')
          throw new ProfileError(
            n,
            `SET would change ${v}'s id, and a node's id never changes (§3)`,
            `write the right node, then link ${v} to it or supersede it (§12)`,
            undefined,
            'GN209',
          );
        this.take('p', '=');
        sets.push([v, key, this.value(), n]);
        if (!this.at('p', ',')) break;
        this.take('p', ',');
      }
    }
    if (!this.at('end'))
      throw new ProfileError(
        this.line(),
        `unexpected '${this.peek()[1]}'`,
        'a data block ends after its INSERT and SET (§3)',
        undefined,
        'GN210',
      );
    return [matches, paths, sets];
  }
}

module.exports = { Parser };
