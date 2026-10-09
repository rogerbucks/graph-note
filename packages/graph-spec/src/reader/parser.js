// The parser of one data block's statement: MATCH, INSERT (or the data shortcut) and SET (gql_profile.py).
'use strict';

const { GTime } = require('../values/times.js');
const { ProfileError } = require('./profile-error.js');
const { unquote, utcNaive } = require('./tokens.js');

class Parser {
  constructor(t) {
    this.t = t;
    this.i = 0;
    this.commas = [];
  } // commas: the lines a missing comma was read after (§3)
  peek(k = 0) {
    return this.t[this.i + k] || ['end', '', this.t.length ? this.t[this.t.length - 1][2] : 1, ''];
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
    throw new ProfileError(n, `expected a name, found '${t || 'the end'}'`, 'keep to the document profile (§3)');
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
        throw new ProfileError(n, `'${s}' is not a date`, "write DATE 'YYYY-MM-DD'");
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
    );
  }
  props() {
    const out = {};
    if (!this.at('p', '{')) return out;
    this.take('p', '{');
    while (!this.at('p', '}')) {
      const key = this.name();
      this.take('p', ':');
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
    const props = this.props();
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
      const line = this.line();
      const type = this.name();
      const props = this.props();
      this.take('p', ']');
      this.take('arrow');
      rels.push({ type, props, bare, line });
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
            this.commas.push(prev[2]);
            paths.push(p);
            continue;
          } catch (e) {
            if (!(e instanceof ProfileError)) throw e;
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
      );
    return [matches, paths, sets];
  }
}

module.exports = { Parser };
