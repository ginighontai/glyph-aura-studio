import { apiUrl } from '@/lib/assets';
import type { ScriptId } from '@/types/project';

export interface Capabilities {
  geminiConfigured: boolean;
  styleAnalysis: boolean;
  ocrVerification: boolean;
  aiTransliteration: boolean;
  imageGeneration: boolean;
  models: { text: string | null; image: string | null };
}

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly capability?: string;

  constructor(message: string, options: { code: string; status: number; capability?: string }) {
    super(message);
    this.name = 'ApiError';
    this.code = options.code;
    this.status = options.status;
    this.capability = options.capability;
  }
}

async function request<T>(path: string, body?: unknown, timeoutMs = 120_000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(apiUrl(path), {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });

    const text = await response.text();
    const payload = text ? JSON.parse(text) : {};

    if (!response.ok) {
      const error = payload?.error ?? {};
      throw new ApiError(error.message ?? `Request to ${path} failed (${response.status}).`, {
        code: error.code ?? 'UNKNOWN',
        status: response.status,
        capability: error.capability,
      });
    }
    return payload as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if ((error as Error)?.name === 'AbortError') {
      throw new ApiError('The request timed out. The model may be busy — try again.', {
        code: 'TIMEOUT',
        status: 504,
      });
    }
    throw new ApiError(
      'Could not reach the GlyphAura API server. Is it running? (`npm run dev` starts both halves.)',
      { code: 'NETWORK', status: 0 },
    );
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchCapabilities(): Promise<Capabilities> {
  const payload = await request<{ capabilities: Capabilities }>('/health', undefined, 8000);
  return payload.capabilities;
}

export interface AnalyzeResponse {
  styleDna: unknown;
  meta: { engine: string; model: string | null; elapsedMs: number };
}

export function analyzeReference(input: {
  imageBase64: string;
  mimeType: string;
  scriptHint?: string;
  notes?: string;
}): Promise<AnalyzeResponse> {
  return request<AnalyzeResponse>('/analyze', input);
}

export interface OcrResponse {
  text: string;
  script: string;
  legibility: number | null;
  notes: string;
}

export function ocrImage(input: {
  imageBase64: string;
  mimeType: string;
  expectedText?: string;
}): Promise<OcrResponse> {
  return request<OcrResponse>('/ocr', input);
}

export interface TransliterateResponse {
  converted: string;
  alternatives: string[];
  notes: string;
}

export function transliterateWithGemini(input: {
  text: string;
  targetScript: Exclude<ScriptId, 'Latin'>;
  currentGuess?: string;
}): Promise<TransliterateResponse> {
  return request<TransliterateResponse>('/transliterate', input, 45_000);
}

export interface GenerateImageResponse {
  image: { base64: string; mimeType: string };
  note: string | null;
  meta: { engine: string; model: string; elapsedMs: number; promptCharacters: number };
}

export function generateImage(input: {
  prompt: string;
  text: string;
  script: ScriptId;
  aspectRatio?: string;
  transparent?: boolean;
  referenceImage?: { imageBase64: string; mimeType: string } | null;
}): Promise<GenerateImageResponse> {
  return request<GenerateImageResponse>('/generate-image', input, 180_000);
}

/** Turns a base64 payload into an object URL for display and export. */
export function base64ToObjectUrl(base64: string, mimeType: string): string {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return URL.createObjectURL(new Blob([bytes], { type: mimeType }));
}
