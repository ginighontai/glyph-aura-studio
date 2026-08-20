import type { EffectiveStyle } from '@/lib/render/params';
import type { LayoutResult } from '@/lib/render/layout';
import type { FidelityControls, GenerationModeId, ScriptId } from '@/types/project';
import type { StyleDna } from '@/types/styleDna';

/**
 * Live render artefacts.
 *
 * Canvases and decoded bitmaps are large, mutable and not worth putting through
 * a reducer, so they live here beside the store. Keeping the render *inputs*
 * alongside them is what lets the export step re-render the poster at 2× or 4×
 * from scratch instead of upscaling the preview.
 */

export interface RenderContext {
  dna: StyleDna;
  script: ScriptId;
  text: string;
  fidelity: FidelityControls;
  mode: GenerationModeId;
  transparent: boolean;
  fontOverride: string | null;
  baseWidth: number;
  baseHeight: number;
}

interface Artifacts {
  /** Canvas of the most recent poster, at preview resolution. */
  poster: HTMLCanvasElement | null;
  /** Everything needed to redraw the poster at any size. */
  context: RenderContext | null;
  style: EffectiveStyle | null;
  layout: LayoutResult | null;
  fontSize: number;
  /** Decoded AI raster output, kept for re-export and background removal. */
  raster: HTMLImageElement | null;
  /** Reference image pixels, so re-analysis does not re-decode the file. */
  referencePixels: ImageData | null;
}

export const artifacts: Artifacts = {
  poster: null,
  context: null,
  style: null,
  layout: null,
  fontSize: 0,
  raster: null,
  referencePixels: null,
};

export function resetArtifacts(): void {
  artifacts.poster = null;
  artifacts.context = null;
  artifacts.style = null;
  artifacts.layout = null;
  artifacts.fontSize = 0;
  artifacts.raster = null;
}
