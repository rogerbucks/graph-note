// Test support for the editor server's threat tests (editor-threats.test.js, editor-threats-process.test.js):
// - requests made on connections of their own;
// - whether an address answers;
// - the server started as the mod will, as a process, with the test-only notes of fixtures/editor-server-test.ts.
// Test code only: nothing here ships.
import { after } from 'node:test';
import http from 'node:http';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/** The server's own folder, the shipped process, and the test-only process that serves the test notes. */
export const SERVER = fileURLToPath(new URL('../server/', import.meta.url));
export const ENTRY = fileURLToPath(new URL('../server/editor-server.ts', import.meta.url));
export const FIXTURE = fileURLToPath(new URL('fixtures/editor-server-test.ts', import.meta.url));

/** The content security policy every answer must carry, as the owner set it. */
export const POLICY =
  "default-src 'self'; script-src 'self'; worker-src 'self'; connect-src 'self'; img-src 'self' data: blob:; " +
  "style-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'; object-src 'none'";

/** One request, made on a connection of its own; resolves with its status, headers and text. */
export function ask(port, { method = 'GET', path = '/', headers = {}, body, setHost = true } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path, headers, agent: false, setHost }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (d) => (text += d));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text }));
    });
    req.on('error', reject);
    if (Array.isArray(body)) {
      for (const part of body) req.write(part);
      req.end();
    } else req.end(body);
  });
}

/** Raw bytes sent on a connection of their own; resolves with all that comes back before it closes. */
export function sendRaw(port, bytes) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: '127.0.0.1', port });
    let back = '';
    socket.setEncoding('utf8');
    socket.on('data', (d) => (back += d));
    socket.on('close', () => resolve(back));
    socket.on('error', reject);
    socket.end(bytes);
  });
}

/**
 * Whether anything answers a connection to an address and port. Some addresses of this machine drop the attempt, as a
 * VPN's may. Such an address is given a few seconds: a server listening there would have answered at once.
 */
export function reachable(host, port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port, timeout: 3000 });
    socket.once('connect', () => (socket.destroy(), resolve(true)));
    socket.once('timeout', () => (socket.destroy(), resolve(false)));
    socket.once('error', () => resolve(false));
  });
}

/** Waits a little, for polling. */
export const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/** Whether a process is still there. */
export function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Starts the server as a process, as the mod will: the test-only one serving the test notes unless `entry` says which.
 * Gives what it prints, when it exits, and the address it hands over; it is killed when the file's tests end.
 */
export function startProcess(args = [], options = {}, entry = FIXTURE) {
  const lead = entry === FIXTURE ? [FIXTURE, '--serve'] : [entry];
  const child = spawn(process.execPath, [...lead, ...args], { stdio: 'pipe', ...options });
  const out = { stdout: '', stderr: '' };
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (d) => (out.stderr += d));
  const exited = new Promise((r) => child.on('exit', (code, signal) => r({ code, signal })));
  const ready = new Promise((resolve, reject) => {
    child.stdout.on('data', (d) => {
      out.stdout += d;
      if (out.stdout.includes('\n')) resolve(JSON.parse(out.stdout.split('\n')[0]));
    });
    child.on('exit', () => reject(new Error(`the server exited before it was ready: ${out.stderr}`)));
  });
  ready.catch(() => {}); // a test that expects it to exit at once awaits `exited`, never `ready`
  after(() => child.exitCode === null && child.signalCode === null && child.kill('SIGKILL'));
  return { child, out, exited, ready };
}
