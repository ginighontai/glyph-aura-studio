import { config } from './env.mjs';

export function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  });
  res.end(body);
}

export function sendError(res, status, code, message, extra = {}) {
  sendJson(res, status, { error: { code, message, ...extra } });
}

export class HttpError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

export async function readJsonBody(req) {
  const limit = config.maxUploadBytes;
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) {
      throw new HttpError(
        413,
        'PAYLOAD_TOO_LARGE',
        `Request body exceeds the ${Math.round(limit / (1024 * 1024))}MB limit.`,
      );
    }
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  const text = Buffer.concat(chunks).toString('utf8');
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, 'INVALID_JSON', 'Request body is not valid JSON.');
  }
}

export function requireString(value, field, { max = 20000, min = 1 } = {}) {
  if (typeof value !== 'string') {
    throw new HttpError(400, 'INVALID_FIELD', `"${field}" must be a string.`);
  }
  const trimmed = value.trim();
  if (trimmed.length < min) {
    throw new HttpError(400, 'INVALID_FIELD', `"${field}" must not be empty.`);
  }
  if (value.length > max) {
    throw new HttpError(400, 'INVALID_FIELD', `"${field}" exceeds ${max} characters.`);
  }
  return value;
}

const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp']);

export function requireImage(body) {
  const mimeType = typeof body.mimeType === 'string' ? body.mimeType.toLowerCase() : '';
  if (!ALLOWED_IMAGE_TYPES.has(mimeType)) {
    throw new HttpError(
      415,
      'UNSUPPORTED_IMAGE_TYPE',
      'Only PNG, JPG and WEBP reference images are supported.',
    );
  }
  const data = typeof body.imageBase64 === 'string' ? body.imageBase64 : '';
  const cleaned = data.includes(',') && data.startsWith('data:') ? data.slice(data.indexOf(',') + 1) : data;
  if (cleaned.length < 32) {
    throw new HttpError(400, 'INVALID_IMAGE', 'The image payload is missing or too small.');
  }
  return { mimeType: mimeType === 'image/jpg' ? 'image/jpeg' : mimeType, data: cleaned };
}
