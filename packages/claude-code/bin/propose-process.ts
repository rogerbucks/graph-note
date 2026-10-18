// Sends Claude's proposal to the editor's server, for the Claude Code host (spec §26, cc_claude_proposes). Node runs it
// as a process, because a mod has no network.
// - The request comes in on standard input as one JSON object, `{port, note, key, body}`.
// - So the key is in no argument and in no command line.
// - It goes to 127.0.0.1 alone, to the one proposal route (`PUT /api/notes/<id>/proposal`).
// - It carries the server's own origin, as a write needs.
// - The answer goes out on standard output as `{status, text}`. Nothing else is written.
// - A failure says only that the editor could not be reached.
import { request } from 'node:http';

interface Sending {
  port: number;
  note: string;
  key: string;
  body: string;
}

const fail = () => {
  process.stdout.write(JSON.stringify({ status: 0, text: 'The editor could not be reached.' }));
};

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d: string) => (input += d));
process.stdin.on('end', () => {
  let s: Sending;
  try {
    s = JSON.parse(input) as Sending;
    const fine =
      Number.isInteger(s.port) &&
      s.port > 0 &&
      s.port < 65536 &&
      /^[0-9a-f]{32}$/.test(s.note) &&
      /^[A-Za-z0-9_-]{32,}$/.test(s.key) &&
      typeof s.body === 'string';
    if (!fine) throw new Error('not a proposal request');
  } catch {
    return fail();
  }
  const origin = `http://127.0.0.1:${s.port}`;
  const req = request(
    {
      host: '127.0.0.1',
      port: s.port,
      method: 'PUT',
      path: `/api/notes/${s.note}/proposal`,
      timeout: 20_000,
      headers: {
        authorization: `Bearer ${s.key}`,
        origin,
        'sec-fetch-site': 'same-origin',
        'content-type': 'application/json; charset=utf-8',
        'content-length': Buffer.byteLength(s.body),
      },
    },
    (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (d: string) => (text += d));
      res.on('end', () => process.stdout.write(JSON.stringify({ status: res.statusCode ?? 0, text })));
    },
  );
  req.on('timeout', () => req.destroy());
  req.on('error', fail);
  req.end(s.body);
});
