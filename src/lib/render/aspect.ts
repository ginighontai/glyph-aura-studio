import {
  MAX_EXPORT_EDGE,
  MAX_EXPORT_PIXELS,
  aspectPreset,
  type AspectRatioId,
} from '@/types/project';
import { clamp } from '@/types/styleDna';

export interface CanvasSize {
  width: number;
  height: number;
}

export interface CustomSize {
  width: number;
  height: number;
}

export const MIN_CUSTOM_EDGE = 240;
export const MAX_CUSTOM_EDGE = 6000;

/** Base (1×) render size for the chosen aspect ratio. */
export function resolveCanvasSize(id: AspectRatioId, custom?: CustomSize): CanvasSize {
  if (id === 'custom' && custom) {
    return {
      width: Math.round(clamp(custom.width, MIN_CUSTOM_EDGE, MAX_CUSTOM_EDGE)),
      height: Math.round(clamp(custom.height, MIN_CUSTOM_EDGE, MAX_CUSTOM_EDGE)),
    };
  }
  const preset = aspectPreset(id);
  return { width: preset.width, height: preset.height };
}

/** Preview size: keeps the on-screen render fast without changing composition. */
export function previewSize(size: CanvasSize, maxEdge = 1500): CanvasSize {
  const factor = Math.min(1, maxEdge / Math.max(size.width, size.height));
  return {
    width: Math.max(1, Math.round(size.width * factor)),
    height: Math.max(1, Math.round(size.height * factor)),
  };
}

export interface ScaledSize extends CanvasSize {
  /** The scale actually applied after clamping to browser-safe limits. */
  appliedScale: number;
  capped: boolean;
  note?: string;
}

export function scaledSize(size: CanvasSize, scale: number): ScaledSize {
  let applied = scale;
  let capped = false;

  const edgeLimit = MAX_EXPORT_EDGE / Math.max(size.width, size.height);
  if (applied > edgeLimit) {
    applied = edgeLimit;
    capped = true;
  }
  const pixelLimit = Math.sqrt(MAX_EXPORT_PIXELS / (size.width * size.height));
  if (applied > pixelLimit) {
    applied = pixelLimit;
    capped = true;
  }

  const width = Math.max(1, Math.round(size.width * applied));
  const height = Math.max(1, Math.round(size.height * applied));

  return {
    width,
    height,
    appliedScale: applied,
    capped,
    note: capped
      ? `Requested ${scale}× exceeds what browsers can allocate, so the export was capped at ${applied.toFixed(2)}× (${width} × ${height}px).`
      : undefined,
  };
}

/** Print resolution for the export, so designers know what they are getting. */
export function describeOutput(size: CanvasSize, id: AspectRatioId): string {
  const preset = aspectPreset(id);
  const megapixels = (size.width * size.height) / 1_000_000;
  if (preset.print) {
    const dpi = Math.round(size.width / (preset.print.widthMm / 25.4));
    return `${size.width} × ${size.height}px · ${megapixels.toFixed(1)} MP · ${dpi} DPI at ${preset.print.widthMm} × ${preset.print.heightMm}mm`;
  }
  return `${size.width} × ${size.height}px · ${megapixels.toFixed(1)} MP`;
}

export const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

export function describeRatio(size: CanvasSize): string {
  const divisor = gcd(size.width, size.height) || 1;
  const w = size.width / divisor;
  const h = size.height / divisor;
  if (w <= 40 && h <= 40) return `${w} : ${h}`;
  return `${(size.width / size.height).toFixed(2)} : 1`;
}
