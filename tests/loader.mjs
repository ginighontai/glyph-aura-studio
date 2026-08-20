/**
 * Zero-dependency test loader.
 *
 * Node can already strip TypeScript types (`--experimental-strip-types`), so the
 * only thing missing when importing `src/**` directly is module resolution:
 * the studio code uses the `@/` alias and extensionless specifiers, which the
 * bundler understands but Node does not. This hook fills that gap, which keeps
 * `npm test` runnable without installing a single package.
 */
import { register } from 'node:module';
import { existsSync, statSync } from 'node:fs';
import { dirname, join, resolve as resolvePath } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolvePath(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = join(root, 'src');

const CANDIDATE_SUFFIXES = ['', '.ts', '.tsx', '.mjs', '.js', '/index.ts', '/index.tsx'];

function firstExisting(basePath) {
  for (const suffix of CANDIDATE_SUFFIXES) {
    const candidate = `${basePath}${suffix}`;
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

export function resolve(specifier, context, nextResolve) {
  let target = null;

  if (specifier.startsWith('@/')) {
    target = firstExisting(join(srcDir, specifier.slice(2)));
  } else if (specifier.startsWith('.') && context.parentURL?.startsWith('file:')) {
    const parentDir = dirname(fileURLToPath(context.parentURL));
    target = firstExisting(resolvePath(parentDir, specifier));
  }

  if (target) {
    return { url: pathToFileURL(target).href, shortCircuit: true, format: undefined };
  }
  return nextResolve(specifier, context);
}

// Registering from the same file lets `node --import ./tests/loader.mjs` work.
if (!process.env.GLYPHAURA_LOADER_REGISTERED) {
  process.env.GLYPHAURA_LOADER_REGISTERED = '1';
  register(import.meta.url, pathToFileURL(join(root, '/')));
}
