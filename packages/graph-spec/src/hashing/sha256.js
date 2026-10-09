// SHA-256, computed here synchronously, so no platform crypto is needed.
'use strict';

// ── SHA-256 and RFC 8785 canonical JSON ─────────────────────────────────────────────────────────
const SHA_K = [],
  SHA_H0 = [];
(function () {
  const primes = [];
  for (let n = 2; primes.length < 64; n++) {
    if (primes.every((p) => n % p)) primes.push(n);
  }
  const frac = (x) => Math.floor((x - Math.floor(x)) * 4294967296) >>> 0;
  primes.forEach((p, i) => {
    SHA_K.push(frac(Math.cbrt(p)));
    if (i < 8) SHA_H0.push(frac(Math.sqrt(p)));
  });
})();
const rotr = (x, n) => (x >>> n) | (x << (32 - n));
function sha256hex(str) {
  const bytes = new TextEncoder().encode(str),
    byteLength = bytes.length,
    size = ((byteLength + 9 + 63) >> 6) << 6;
  const m = new Uint8Array(size);
  m.set(bytes);
  m[byteLength] = 0x80;
  const dv = new DataView(m.buffer),
    bits = byteLength * 8;
  dv.setUint32(size - 4, bits >>> 0);
  dv.setUint32(size - 8, Math.floor(bits / 4294967296));
  let state = SHA_H0.slice();
  const schedule = new Uint32Array(64);
  for (let i = 0; i < size; i += 64) {
    for (let t = 0; t < 16; t++) schedule[t] = dv.getUint32(i + t * 4);
    for (let t = 16; t < 64; t++) {
      const s0 = rotr(schedule[t - 15], 7) ^ rotr(schedule[t - 15], 18) ^ (schedule[t - 15] >>> 3),
        s1 = rotr(schedule[t - 2], 17) ^ rotr(schedule[t - 2], 19) ^ (schedule[t - 2] >>> 10);
      schedule[t] = (schedule[t - 16] + s0 + schedule[t - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = state;
    for (let t = 0; t < 64; t++) {
      const t1 = (h + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + SHA_K[t] + schedule[t]) >>> 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    state = [a, b, c, d, e, f, g, h].map((x, k) => (state[k] + x) >>> 0);
  }
  return state.map((x) => x.toString(16).padStart(8, '0')).join('');
}

module.exports = { sha256hex };
