import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';
import { config, capabilities, projectRoot } from './lib/env.mjs';
import { HttpError, readJsonBody, requireImage, requireString, sendError, sendJson } from './lib/http.mjs';
import { generateImage, generateStructured } from './lib/gemini.mjs';
import { OCR_SCHEMA, STYLE_DNA_SCHEMA, TRANSLITERATION_SCHEMA } from './lib/schema.mjs';
import {
  OCR_SYSTEM_PROMPT,
  STYLE_ANALYST_SYSTEM_PROMPT,
  TRANSLITERATION_SYSTEM_PROMPT,
  imageGenerationGuard,
  ocrUserPrompt,
  styleAnalysisUserPrompt,
  transliterationUserPrompt,
} from './lib/prompts.mjs';

const distDir = join(projectRoot, 'dist');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

/* ------------------------------------------------------------------ routes */

const routes = new Map();

const route = (method, path, handler) => routes.set(`${method} ${path}`, handler);

route('GET', '/api/health', async (_req, res) => {
  sendJson(res, 200, {
    ok: true,
    service: 'glyphaura-studio',
    version: 1,
    time: new Date().toISOString(),
    capabilities: capabilities(),
  });
});

route('POST', '/api/analyze', async (req, res) => {
  const body = await readJsonBody(req);
  const image = requireImage(body);
  const scriptHint = typeof body.scriptHint === 'string' ? body.scriptHint : 'auto';
  const notes = typeof body.notes === 'string' ? body.notes.slice(0, 600) : '';

  const started = Date.now();
  const { json, usage, model } = await generateStructured({
    systemPrompt: STYLE_ANALYST_SYSTEM_PROMPT,
    userPrompt: styleAnalysisUserPrompt({ scriptHint, notes }),
    image,
    schema: STYLE_DNA_SCHEMA,
    temperature: 0.2,
  });

  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    throw new HttpError(502, 'GEMINI_BAD_RESPONSE', 'Style analysis did not return an object.');
  }

  sendJson(res, 200, {
    styleDna: json,
    meta: { engine: 'gemini', model, elapsedMs: Date.now() - started, usage },
  });
});

route('POST', '/api/ocr', async (req, res) => {
  const body = await readJsonBody(req);
  const image = requireImage(body);
  const expectedText = typeof body.expectedText === 'string' ? body.expectedText.slice(0, 4000) : '';

  const { json, model } = await generateStructured({
    systemPrompt: OCR_SYSTEM_PROMPT,
    userPrompt: ocrUserPrompt(expectedText),
    image,
    schema: OCR_SCHEMA,
    temperature: 0,
  });

  sendJson(res, 200, {
    text: typeof json.text === 'string' ? json.text : '',
    script: typeof json.script === 'string' ? json.script : 'Unknown',
    legibility: typeof json.legibility === 'number' ? json.legibility : null,
    notes: typeof json.notes === 'string' ? json.notes : '',
    meta: { engine: 'gemini', model },
  });
});

route('POST', '/api/transliterate', async (req, res) => {
  const body = await readJsonBody(req);
  const text = requireString(body.text, 'text', { max: 4000 });
  const targetScript = requireString(body.targetScript, 'targetScript', { max: 40 });
  if (!/^(bengali|devanagari)$/i.test(targetScript)) {
    throw new HttpError(
      400,
      'UNSUPPORTED_SCRIPT',
      'targetScript must be "Bengali" or "Devanagari".',
    );
  }
  const currentGuess = typeof body.currentGuess === 'string' ? body.currentGuess.slice(0, 4000) : '';

  const { json, model } = await generateStructured({
    systemPrompt: TRANSLITERATION_SYSTEM_PROMPT,
    userPrompt: transliterationUserPrompt({ text, targetScript, currentGuess }),
    schema: TRANSLITERATION_SCHEMA,
    temperature: 0.1,
  });

  sendJson(res, 200, {
    converted: typeof json.converted === 'string' ? json.converted : '',
    alternatives: Array.isArray(json.alternatives)
      ? json.alternatives.filter((item) => typeof item === 'string').slice(0, 3)
      : [],
    notes: typeof json.notes === 'string' ? json.notes : '',
    meta: { engine: 'gemini', model },
  });
});

route('POST', '/api/generate-image', async (req, res) => {
  const body = await readJsonBody(req);
  const prompt = requireString(body.prompt, 'prompt', { max: 30000 });
  const text = requireString(body.text, 'text', { max: 4000 });
  const script = typeof body.script === 'string' ? body.script : 'Latin';
  const aspectRatio = typeof body.aspectRatio === 'string' ? body.aspectRatio : undefined;
  const transparent = Boolean(body.transparent);
  const referenceImage =
    body.referenceImage && typeof body.referenceImage === 'object'
      ? requireImage(body.referenceImage)
      : null;

  const fullPrompt = `${prompt}\n\n${imageGenerationGuard({ text, script })}`;
  const started = Date.now();
  const result = await generateImage({
    prompt: fullPrompt,
    aspectRatio,
    referenceImage,
    transparent,
  });

  sendJson(res, 200, {
    image: { base64: result.image.data, mimeType: result.image.mimeType },
    note: result.note,
    meta: {
      engine: 'gemini-image',
      model: result.model,
      elapsedMs: Date.now() - started,
      promptCharacters: fullPrompt.length,
    },
  });
});

/* ------------------------------------------------------------------ static */

function serveStatic(req, res, pathname) {
  if (!existsSync(distDir)) {
    sendJson(res, 200, {
      service: 'glyphaura-studio API',
      message:
        'The production bundle has not been built yet. Run `npm run dev` for the studio UI, or `npm run build` then `npm start`.',
      capabilities: capabilities(),
    });
    return;
  }

  const requested = pathname === '/' ? '/index.html' : pathname;
  const safe = normalize(requested).replace(/^(\.\.[/\\])+/, '');
  let filePath = join(distDir, safe);
  if (!filePath.startsWith(distDir + sep) && filePath !== join(distDir, 'index.html')) {
    sendError(res, 403, 'FORBIDDEN', 'Path traversal is not allowed.');
    return;
  }
  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    filePath = join(distDir, 'index.html');
  }
  const ext = extname(filePath).toLowerCase();
  const isHashed = /\.[0-9a-f]{8,}\./i.test(filePath);
  res.writeHead(200, {
    'content-type': MIME[ext] ?? 'application/octet-stream',
    'cache-control':
      ext === '.html' ? 'no-cache' : isHashed ? 'public, max-age=31536000, immutable' : 'public, max-age=3600',
  });
  createReadStream(filePath).pipe(res);
}

/* ------------------------------------------------------------------ server */

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const pathname = url.pathname;

  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('referrer-policy', 'no-referrer');

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'access-control-allow-headers': 'content-type',
      'access-control-max-age': '600',
    });
    res.end();
    return;
  }

  if (pathname.startsWith('/api/')) {
    const handler = routes.get(`${req.method} ${pathname}`);
    if (!handler) {
      sendError(res, 404, 'NOT_FOUND', `No API route for ${req.method} ${pathname}.`);
      return;
    }
    try {
      await handler(req, res);
    } catch (error) {
      if (error instanceof HttpError) {
        sendError(res, error.status, error.code, error.message, error.extra);
      } else {
        console.error('[glyphaura] unhandled error', error);
        sendError(res, 500, 'INTERNAL_ERROR', 'Unexpected server error.', {
          detail: String(error?.message ?? error).slice(0, 300),
        });
      }
    }
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Only GET and POST are supported.');
    return;
  }

  serveStatic(req, res, pathname);
});

server.listen(config.apiPort, () => {
  const caps = capabilities();
  console.log(`\n  GlyphAura Studio API  ▸  http://localhost:${config.apiPort}`);
  console.log(`  Gemini configured     ▸  ${caps.geminiConfigured ? 'yes' : 'no (local vector engine only)'}`);
  if (caps.geminiConfigured) {
    console.log(`  Text model            ▸  ${caps.models.text}`);
    console.log(`  Image model          ▸  ${caps.models.image ?? 'disabled'}`);
  }
  if (existsSync(distDir)) console.log(`  Serving bundle       ▸  ${distDir}`);
  console.log('');
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
