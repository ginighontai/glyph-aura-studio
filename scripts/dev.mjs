/**
 * Runs the API server and the Vite dev server side by side without pulling in
 * a `concurrently`-style dependency.
 *
 *   node scripts/dev.mjs
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const viteBin = join(root, 'node_modules', 'vite', 'bin', 'vite.js');

if (!existsSync(viteBin)) {
  console.error(
    '\n  Vite is not installed yet.\n' +
      '  Run `npm install` first, then `npm run dev` again.\n' +
      '  (The API server alone can run with `npm run dev:api` — it has zero dependencies.)\n',
  );
  process.exit(1);
}

const palette = { api: '\u001b[38;5;39m', web: '\u001b[38;5;170m', reset: '\u001b[0m' };

/** @type {import('node:child_process').ChildProcess[]} */
const children = [];

function run(label, command, args) {
  const child = spawn(command, args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], env: process.env });
  const tag = `${palette[label] ?? ''}[${label}]${palette.reset}`;
  const pipe = (stream, sink) => {
    let buffer = '';
    stream.setEncoding('utf8');
    stream.on('data', (chunk) => {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) sink.write(`${tag} ${line}\n`);
    });
  };
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  child.on('exit', (code, signal) => {
    if (signal) return;
    console.log(`${tag} exited with code ${code}`);
    shutdown(code ?? 0);
  });
  children.push(child);
  return child;
}

let shuttingDown = false;
function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM');
  }
  setTimeout(() => process.exit(code), 150);
}

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => shutdown(0));

run('api', process.execPath, [join(root, 'server', 'index.mjs')]);
run('web', process.execPath, [viteBin]);
