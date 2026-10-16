// bin/propose-process.ts
import { request } from "node:http";
var fail = () => {
  process.stdout.write(JSON.stringify({ status: 0, text: "The editor could not be reached." }));
};
var input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (d) => input += d);
process.stdin.on("end", () => {
  let s;
  try {
    s = JSON.parse(input);
    const fine = Number.isInteger(s.port) && s.port > 0 && s.port < 65536 && /^[0-9a-f]{32}$/.test(s.note) && /^[A-Za-z0-9_-]{32,}$/.test(s.key) && typeof s.body === "string";
    if (!fine) throw new Error("not a proposal request");
  } catch {
    return fail();
  }
  const origin = `http://127.0.0.1:${s.port}`;
  const req = request(
    {
      host: "127.0.0.1",
      port: s.port,
      method: "PUT",
      path: `/api/notes/${s.note}/proposal`,
      timeout: 2e4,
      headers: {
        authorization: `Bearer ${s.key}`,
        origin,
        "sec-fetch-site": "same-origin",
        "content-type": "application/json; charset=utf-8",
        "content-length": Buffer.byteLength(s.body)
      }
    },
    (res) => {
      let text = "";
      res.setEncoding("utf8");
      res.on("data", (d) => text += d);
      res.on("end", () => process.stdout.write(JSON.stringify({ status: res.statusCode ?? 0, text })));
    }
  );
  req.on("timeout", () => req.destroy());
  req.on("error", fail);
  req.end(s.body);
});
