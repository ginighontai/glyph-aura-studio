import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const projectRoot = join(here, '..', '..');

/**
 * Minimal .env loader — avoids a dotenv dependency so the server can run
 * with zero `npm install` steps.  Existing process.env values always win.
 */
function parseEnvFile(contents) {
  const out = {};
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

let loaded = false;
export function loadEnv() {
  if (loaded) return;
  loaded = true;
  for (const name of ['.env.local', '.env']) {
    const file = join(projectRoot, name);
    if (!existsSync(file)) continue;
    const parsed = parseEnvFile(readFileSync(file, 'utf8'));
    for (const [key, value] of Object.entries(parsed)) {
      if (process.env[key] === undefined || process.env[key] === '') {
        process.env[key] = value;
      }
    }
  }
}

loadEnv();

const str = (name, fallback = '') => {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
};

export const config = {
  get apiKey() {
    return str('GEMINI_API_KEY');
  },
  get textModel() {
    return str('GEMINI_TEXT_MODEL', 'gemini-2.5-flash');
  },
  get imageModel() {
    return str('GEMINI_IMAGE_MODEL', 'gemini-2.5-flash-image');
  },
  get apiPort() {
    return Number(str('API_PORT', '8787'));
  },
  get maxUploadBytes() {
    return Math.round(Number(str('MAX_UPLOAD_MB', '12')) * 1024 * 1024);
  },
  get isProduction() {
    return str('NODE_ENV') === 'production';
  },
  get baseUrl() {
    return str('GEMINI_BASE_URL', 'https://generativelanguage.googleapis.com/v1beta');
  },
};

export function capabilities() {
  const hasKey = Boolean(config.apiKey);
  return {
    geminiConfigured: hasKey,
    styleAnalysis: hasKey,
    ocrVerification: hasKey,
    aiTransliteration: hasKey,
    imageGeneration: hasKey && Boolean(config.imageModel),
    models: {
      text: hasKey ? config.textModel : null,
      image: hasKey && config.imageModel ? config.imageModel : null,
    },
  };
}
