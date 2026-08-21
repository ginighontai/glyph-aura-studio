/**
 * Resolves runtime URLs against the page's base.
 *
 * The studio can be served from a domain root (`npm start`) or from a
 * sub-path (GitHub Pages serves it at `/<repo>/`). Hard-coding `/fonts/...`
 * breaks the second case, so paths are resolved against `document.baseURI`,
 * which Vite fills in from the configured base at build time.
 */
const FALLBACK_BASE = 'http://localhost/';

const baseUri = (): string => {
  if (typeof document !== 'undefined' && document.baseURI) return document.baseURI;
  return FALLBACK_BASE;
};

/** `/fonts/Inter.ttf` → `/glyph-aura-studio/fonts/Inter.ttf` when deployed there. */
export function assetUrl(path: string): string {
  const relative = path.replace(/^\/+/, '');
  try {
    return new URL(relative, baseUri()).href;
  } catch {
    return `/${relative}`;
  }
}

/** Same resolution for API calls, so a sub-path deployment still finds them. */
export function apiUrl(path: string): string {
  return assetUrl(`api/${path.replace(/^\/+/, '')}`);
}
