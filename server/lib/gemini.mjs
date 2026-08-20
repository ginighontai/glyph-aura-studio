import { config } from './env.mjs';
import { HttpError } from './http.mjs';

const RETRYABLE = new Set([429, 500, 502, 503, 504]);

function endpoint(model, method) {
  return `${config.baseUrl}/models/${encodeURIComponent(model)}:${method}?key=${encodeURIComponent(config.apiKey)}`;
}

function assertKey() {
  if (!config.apiKey) {
    throw new HttpError(
      503,
      'GEMINI_NOT_CONFIGURED',
      'No GEMINI_API_KEY is configured on the server. The local vector engine is still available.',
      { capability: 'gemini' },
    );
  }
}

async function post(url, body, { timeoutMs = 90_000, attempts = 3 } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const text = await response.text();
      let payload;
      try {
        payload = text ? JSON.parse(text) : {};
      } catch {
        payload = { raw: text };
      }
      if (!response.ok) {
        const message =
          payload?.error?.message ?? `Gemini request failed with status ${response.status}.`;
        if (RETRYABLE.has(response.status) && attempt < attempts) {
          lastError = new HttpError(502, 'GEMINI_UPSTREAM', message);
          await new Promise((r) => setTimeout(r, 400 * attempt * attempt));
          continue;
        }
        const status = response.status === 400 || response.status === 403 ? response.status : 502;
        throw new HttpError(status, 'GEMINI_UPSTREAM', message, {
          upstreamStatus: response.status,
        });
      }
      return payload;
    } catch (error) {
      if (error instanceof HttpError) throw error;
      const aborted = error?.name === 'AbortError';
      lastError = new HttpError(
        aborted ? 504 : 502,
        aborted ? 'GEMINI_TIMEOUT' : 'GEMINI_UNREACHABLE',
        aborted
          ? 'Gemini did not respond in time. Try again, or use the local vector engine.'
          : `Could not reach Gemini: ${error?.message ?? 'unknown network error'}.`,
      );
      if (attempt >= attempts) throw lastError;
      await new Promise((r) => setTimeout(r, 400 * attempt * attempt));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError ?? new HttpError(502, 'GEMINI_UNREACHABLE', 'Gemini request failed.');
}

function collectText(payload) {
  const parts = payload?.candidates?.[0]?.content?.parts ?? [];
  return parts
    .map((part) => (typeof part?.text === 'string' ? part.text : ''))
    .join('')
    .trim();
}

function collectInlineImages(payload) {
  const parts = payload?.candidates?.[0]?.content?.parts ?? [];
  const images = [];
  for (const part of parts) {
    const inline = part?.inlineData ?? part?.inline_data;
    if (inline?.data) {
      images.push({
        data: inline.data,
        mimeType: inline.mimeType ?? inline.mime_type ?? 'image/png',
      });
    }
  }
  return images;
}

/** Tolerant JSON extraction — handles stray prose or ```json fences. */
export function extractJson(text) {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : text).trim();
  try {
    return JSON.parse(candidate);
  } catch {
    /* fall through to brace scanning */
  }
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try {
      return JSON.parse(candidate.slice(start, end + 1));
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Structured JSON call against the multimodal text model.
 * @param {{ systemPrompt?: string, userPrompt: string, image?: {mimeType: string, data: string}, schema?: object, temperature?: number, model?: string }} options
 */
export async function generateStructured(options) {
  assertKey();
  const {
    systemPrompt,
    userPrompt,
    image,
    schema,
    temperature = 0.25,
    model = config.textModel,
  } = options;

  const parts = [{ text: userPrompt }];
  if (image) parts.push({ inlineData: { mimeType: image.mimeType, data: image.data } });

  const body = {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      temperature,
      topP: 0.95,
      maxOutputTokens: 8192,
      responseMimeType: 'application/json',
      ...(schema ? { responseSchema: schema } : {}),
    },
    safetySettings: [],
  };
  if (systemPrompt) body.systemInstruction = { parts: [{ text: systemPrompt }] };

  const payload = await post(endpoint(model, 'generateContent'), body);
  const finishReason = payload?.candidates?.[0]?.finishReason;
  const text = collectText(payload);
  const json = extractJson(text);
  if (!json) {
    throw new HttpError(
      502,
      'GEMINI_BAD_RESPONSE',
      finishReason && finishReason !== 'STOP'
        ? `Gemini stopped early (${finishReason}) and returned no usable JSON.`
        : 'Gemini returned a response that could not be parsed as JSON.',
      { rawPreview: text.slice(0, 400) },
    );
  }
  return { json, raw: text, usage: payload?.usageMetadata ?? null, model };
}

/**
 * Image generation. Supports both `gemini-*-image` (generateContent with image
 * response modality) and Imagen (`:predict`) model families.
 */
export async function generateImage({ prompt, aspectRatio, referenceImage, transparent }) {
  assertKey();
  const model = config.imageModel;
  if (!model) {
    throw new HttpError(
      503,
      'IMAGE_MODEL_NOT_CONFIGURED',
      'No GEMINI_IMAGE_MODEL is configured. Switch to the local vector engine or set the model in .env.',
      { capability: 'imageGeneration' },
    );
  }

  if (/^imagen/i.test(model)) {
    const body = {
      instances: [{ prompt }],
      parameters: {
        sampleCount: 1,
        ...(aspectRatio ? { aspectRatio } : {}),
        personGeneration: 'dont_allow',
      },
    };
    const payload = await post(endpoint(model, 'predict'), body);
    const prediction = payload?.predictions?.[0];
    const data = prediction?.bytesBase64Encoded ?? prediction?.image?.bytesBase64Encoded;
    if (!data) {
      throw new HttpError(502, 'IMAGE_GENERATION_EMPTY', 'Imagen returned no image data.');
    }
    return {
      image: { data, mimeType: prediction?.mimeType ?? 'image/png' },
      note: null,
      model,
    };
  }

  const parts = [{ text: prompt }];
  if (referenceImage) {
    parts.push({
      inlineData: { mimeType: referenceImage.mimeType, data: referenceImage.data },
    });
  }
  const body = {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      responseModalities: ['TEXT', 'IMAGE'],
      temperature: 0.4,
      ...(aspectRatio ? { imageConfig: { aspectRatio } } : {}),
    },
  };
  const payload = await post(endpoint(model, 'generateContent'), body);
  const images = collectInlineImages(payload);
  if (!images.length) {
    const reason = payload?.candidates?.[0]?.finishReason;
    const note = collectText(payload);
    throw new HttpError(
      502,
      'IMAGE_GENERATION_EMPTY',
      note ||
        `The image model returned no image${reason ? ` (finish reason: ${reason})` : ''}. Try the local vector engine.`,
    );
  }
  return {
    image: images[0],
    note: collectText(payload) || null,
    model,
    transparentRequested: Boolean(transparent),
  };
}
