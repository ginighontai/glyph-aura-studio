/**
 * Layer analysis for display lettering.
 *
 * Poster calligraphy is almost never a single filled shape. It is a stack:
 * a hard drop-extrusion, an outer border, a contrasting outline, then the letter
 * body — and often a gradient inside the body. Measuring such artwork as one
 * blob is what made every reference come back as "contrasted serif": the thin
 * outline ring and the fat body were averaged into a meaningless middle.
 *
 * The approach here is a depth transform. For every ink pixel we compute its
 * distance to the nearest background pixel, which gives two things a run-length
 * scan cannot:
 *
 *   1. Stroke width that ignores layering — the body core is simply the deepest
 *      part of the shape, so width is 2 x depth rather than a run that happens
 *      to cross a border ring.
 *   2. A colour-by-depth profile. Walking outwards from the core and watching
 *      the mean colour change reveals each concentric layer and its width, which
 *      is exactly how an outline or a border announces itself.
 */
import { distance, kMeansPalette, luminance, toHex, type Rgb } from './color';

export interface LayerBand {
  /** Distance from the silhouette edge, in pixels. */
  depthFrom: number;
  depthTo: number;
  hex: string;
  rgb: Rgb;
  /** Share of the ink this band covers, 0–1. */
  share: number;
}

export interface RingLayer {
  hex: string;
  /** Ring thickness in pixels. */
  widthPx: number;
  /** How different this ring is from the body, 0–1 (perceptual-ish). */
  separation: number;
}

export interface ExtrusionEstimate {
  dx: number;
  dy: number;
  hex: string;
  /** Fraction of the shifted body that the candidate layer explains, 0–1. */
  agreement: number;
  /** Hard extrusions have crisp edges; soft ones are shadows. */
  hard: boolean;
}

export interface LayerAnalysis {
  /** 2 x the deep-core depth: the weight the eye actually reads. */
  strokeWidthPx: number;
  /** Thick-to-thin ratio measured on the body only. */
  strokeContrastRatio: number;
  bodyHex: string;
  /** Concentric rings outside the body, innermost first. */
  rings: RingLayer[];
  bands: LayerBand[];
  extrusion: ExtrusionEstimate | null;
  /**
   * 0 = spiky/angular boundary, 1 = fat and round. Derived from how much ink
   * surrounds each boundary pixel, which separates bubble lettering from
   * hairline monoline and from chiselled angular work.
   */
  roundness: number;
  /** 0 = one flat colour in the body, 1 = strong internal gradient. */
  bodyGradient: number;
  bodyGradientAngle: number;
  /** Distinct ink colours that are not rings — e.g. alternating letter colours. */
  accentHexes: string[];
}

const clamp = (value: number, min: number, max: number): number =>
  Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;

const percentile = (sorted: number[], p: number): number => {
  if (!sorted.length) return 0;
  return sorted[clamp(Math.round((sorted.length - 1) * p), 0, sorted.length - 1)];
};

/**
 * Chamfer distance transform (two passes, 3-4 weights approximating Euclidean).
 * Returns depth in pixels for ink pixels, 0 for background.
 */
export function depthTransform(mask: Uint8Array, width: number, height: number): Float32Array {
  const INF = 1e9;
  const depth = new Float32Array(mask.length);
  for (let i = 0; i < mask.length; i += 1) depth[i] = mask[i] ? INF : 0;

  const at = (x: number, y: number): number =>
    x < 0 || y < 0 || x >= width || y >= height ? 0 : depth[y * width + x];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      if (!mask[i]) continue;
      depth[i] = Math.min(
        depth[i],
        at(x - 1, y) + 3,
        at(x, y - 1) + 3,
        at(x - 1, y - 1) + 4,
        at(x + 1, y - 1) + 4,
      );
    }
  }
  for (let y = height - 1; y >= 0; y -= 1) {
    for (let x = width - 1; x >= 0; x -= 1) {
      const i = y * width + x;
      if (!mask[i]) continue;
      depth[i] = Math.min(
        depth[i],
        at(x + 1, y) + 3,
        at(x, y + 1) + 3,
        at(x + 1, y + 1) + 4,
        at(x - 1, y + 1) + 4,
      );
    }
  }
  for (let i = 0; i < depth.length; i += 1) depth[i] /= 3;
  return depth;
}

const rgbAt = (data: Uint8ClampedArray | Uint8Array, index: number): Rgb => ({
  r: data[index * 4],
  g: data[index * 4 + 1],
  b: data[index * 4 + 2],
});

/** Perceptual-ish separation between two colours, normalised to 0–1. */
export function colourSeparation(a: Rgb, b: Rgb): number {
  const euclid = Math.sqrt(distance(a, b)) / 441.673;
  const lum = Math.abs(luminance(a) - luminance(b)) / 255;
  return clamp(euclid * 0.65 + lum * 0.35, 0, 1);
}

export function analyzeLayers(
  data: Uint8ClampedArray | Uint8Array,
  mask: Uint8Array,
  width: number,
  height: number,
): LayerAnalysis {
  const depth = depthTransform(mask, width, height);

  /* -------------------------------------------------- 1. silhouette geometry */
  const depths: number[] = [];
  for (let i = 0; i < mask.length; i += 1) if (mask[i]) depths.push(depth[i]);
  depths.sort((a, b) => a - b);
  const silhouetteRidge = ridgeDepths(mask, depth, width, height);
  const coreDepth = silhouetteRidge.length
    ? percentile(silhouetteRidge, 0.5)
    : percentile(depths, 0.9);

  /* ------------------------------------------- 2. colour profile versus depth */
  const maxBand = Math.max(2, Math.min(28, Math.ceil(coreDepth * 1.6)));
  const sums = Array.from({ length: maxBand + 1 }, () => ({ r: 0, g: 0, b: 0, n: 0 }));
  for (let i = 0; i < mask.length; i += 1) {
    if (!mask[i]) continue;
    const band = Math.min(maxBand, Math.max(0, Math.round(depth[i])));
    const rgb = rgbAt(data, i);
    const bucket = sums[band];
    bucket.r += rgb.r;
    bucket.g += rgb.g;
    bucket.b += rgb.b;
    bucket.n += 1;
  }
  const inkTotal = depths.length || 1;
  const bands: LayerBand[] = [];
  for (let band = 1; band <= maxBand; band += 1) {
    const bucket = sums[band];
    if (bucket.n < Math.max(12, inkTotal * 0.002)) continue;
    const rgb = { r: bucket.r / bucket.n, g: bucket.g / bucket.n, b: bucket.b / bucket.n };
    bands.push({ depthFrom: band, depthTo: band, hex: toHex(rgb), rgb, share: bucket.n / inkTotal });
  }

  /* ---------------------------------------------------------- 3. body colour */
  // Dominant cluster of the deep core, never a mean: averaging a white body with
  // a red ring yields pink, a colour that appears nowhere in the artwork.
  const coreFloor = Math.max(2, coreDepth * 0.62);
  const coreSamples: Rgb[] = [];
  for (let i = 0; i < mask.length; i += 1) {
    if (mask[i] && depth[i] >= coreFloor) coreSamples.push(rgbAt(data, i));
  }
  const stride = Math.max(1, Math.floor(coreSamples.length / 4000));
  const thinned = coreSamples.filter((_, index) => index % stride === 0);
  const corePalette = kMeansPalette(thinned.length ? thinned : [{ r: 0, g: 0, b: 0 }], 3);
  const body: Rgb = corePalette[0]?.rgb ?? { r: 0, g: 0, b: 0 };
  const bodyHex = corePalette[0]?.hex ?? '#000000';

  /* ------------------------------------------------- 4. geometry of the body */
  // Outline and border rings are finishing, not letterform. Measuring weight,
  // contrast and roundness on the body alone is what stops a monoline bubble
  // face from being mistaken for a contrasted serif.
  const bodyMask = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i += 1) {
    if (mask[i] && colourSeparation(rgbAt(data, i), body) <= 0.18) bodyMask[i] = 1;
  }
  const bodyDepth = depthTransform(bodyMask, width, height);
  const bodyRidge = ridgeDepths(bodyMask, bodyDepth, width, height);
  const ridge = bodyRidge.length > 24 ? bodyRidge : silhouetteRidge;

  const strokeWidthPx = Math.max(1, percentile(ridge, 0.5) * 2);
  const thin = Math.max(0.5, percentile(ridge, 0.12));
  const thick = Math.max(thin, percentile(ridge, 0.9));
  const strokeContrastRatio = clamp(thick / thin, 1, 8);

  // "Roundness" is how bulbous and monoline the forms are: the axis that
  // separates bubble lettering from a contrasted calligraphic hand. Uniformity
  // alone is not enough — a hairline monoline is uniform but not round — so it
  // is gated multiplicatively by absolute weight.
  const uniformity = clamp((2.2 - strokeContrastRatio) / 1.2, 0, 1);
  const weightNorm = clamp(strokeWidthPx / Math.max(1, Math.min(width, height) * 0.09), 0, 1);
  const roundness = clamp(uniformity * (0.25 + 0.75 * weightNorm) * 1.15, 0, 1);

  /* ----------------------------------------------------- 5. concentric rings */
  const rings: RingLayer[] = [];
  const outward = bands
    .filter((band) => band.depthFrom > 1 && band.depthFrom < coreFloor)
    .sort((a, b) => b.depthFrom - a.depthFrom);
  for (const band of outward) {
    const separation = colourSeparation(band.rgb, body);
    if (separation < 0.14) continue;
    const existing = rings.find((ring) => colourSeparation(band.rgb, hexRgb(ring.hex)) < 0.12);
    if (existing) {
      existing.widthPx += 1;
      continue;
    }
    rings.push({ hex: band.hex, widthPx: 1, separation });
  }

  /* ------------------------------------------------ 6. gradient and accents */
  const coreIndices: number[] = [];
  for (let i = 0; i < mask.length; i += 1) if (bodyMask[i]) coreIndices.push(i);
  const meanOf = (subset: number[]): Rgb => {
    if (!subset.length) return body;
    let r = 0;
    let g = 0;
    let b = 0;
    for (const i of subset) {
      const rgb = rgbAt(data, i);
      r += rgb.r;
      g += rgb.g;
      b += rgb.b;
    }
    return { r: r / subset.length, g: g / subset.length, b: b / subset.length };
  };
  let minY = height;
  let maxY = 0;
  let minX = width;
  let maxX = 0;
  for (const i of coreIndices) {
    const y = Math.floor(i / width);
    const x = i % width;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
  }
  const midY = (minY + maxY) / 2;
  const midX = (minX + maxX) / 2;
  const topMean = meanOf(coreIndices.filter((i) => Math.floor(i / width) < midY));
  const bottomMean = meanOf(coreIndices.filter((i) => Math.floor(i / width) >= midY));
  const leftMean = meanOf(coreIndices.filter((i) => i % width < midX));
  const rightMean = meanOf(coreIndices.filter((i) => i % width >= midX));
  const verticalDelta = colourSeparation(topMean, bottomMean);
  const horizontalDelta = colourSeparation(leftMean, rightMean);
  const bodyGradient = clamp(Math.max(verticalDelta, horizontalDelta) * 2.2, 0, 1);
  const bodyGradientAngle =
    verticalDelta >= horizontalDelta
      ? luminance(topMean) > luminance(bottomMean)
        ? 90
        : -90
      : luminance(leftMean) > luminance(rightMean)
        ? 0
        : 180;

  const accentSamples: Rgb[] = [];
  const accentStride = Math.max(1, Math.floor(coreIndices.length / 3000));
  for (let i = 0; i < coreIndices.length; i += accentStride) {
    accentSamples.push(rgbAt(data, coreIndices[i]));
  }
  const accentHexes = kMeansPalette(accentSamples.length ? accentSamples : [body], 3)
    .filter((entry) => entry.weight > 0.12 && colourSeparation(entry.rgb, body) > 0.22)
    .map((entry) => entry.hex);

  /* ------------------------------------------------------------ 7. extrusion */
  const extrusion = findExtrusion(data, mask, width, height, body, Math.max(2, coreDepth));

  return {
    strokeWidthPx,
    strokeContrastRatio,
    bodyHex,
    rings: rings.slice(0, 3),
    bands,
    extrusion,
    roundness,
    bodyGradient,
    bodyGradientAngle,
    accentHexes,
  };
}

/** Depths at medial-ridge pixels: local maxima of the depth field on both axes. */
function ridgeDepths(
  mask: Uint8Array,
  depth: Float32Array,
  width: number,
  height: number,
): number[] {
  const ridge: number[] = [];
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x;
      if (!mask[i]) continue;
      const d = depth[i];
      if (d < 0.7) continue;
      // Both axes, not either: along a straight stroke the depth is constant in
      // the direction of travel, so a single-axis test matches every pixel and
      // halves the reported width.
      if (
        d >= depth[i - 1] - 0.01 &&
        d >= depth[i + 1] - 0.01 &&
        d >= depth[i - width] - 0.01 &&
        d >= depth[i + width] - 0.01
      ) {
        ridge.push(d);
      }
    }
  }
  ridge.sort((a, b) => a - b);
  return ridge;
}

function hexRgb(hex: string): Rgb {
  const value = Number.parseInt(hex.replace('#', ''), 16);
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

/**
 * Hard drop-extrusion detection.
 *
 * A displaced copy of the letters in a single flat colour is the signature of
 * poster lettering. It is found by testing candidate offsets and asking how much
 * of the shifted silhouette is covered by pixels of one consistent non-body
 * colour.
 */
function findExtrusion(
  data: Uint8ClampedArray | Uint8Array,
  mask: Uint8Array,
  width: number,
  height: number,
  body: Rgb,
  coreDepth: number,
): ExtrusionEstimate | null {
  // Candidate pixels: anything that is neither the body colour nor the frame
  // background. A hard extrusion is usually thresholded *out* of the silhouette,
  // so restricting the search to ink pixels made it invisible.
  const frame: Rgb[] = [];
  for (let x = 0; x < width; x += 3) {
    frame.push(rgbAt(data, x));
    frame.push(rgbAt(data, (height - 1) * width + x));
  }
  const ground = frame.reduce(
    (acc, rgb) => ({ r: acc.r + rgb.r / frame.length, g: acc.g + rgb.g / frame.length, b: acc.b + rgb.b / frame.length }),
    { r: 0, g: 0, b: 0 },
  );

  const candidates: number[] = [];
  for (let i = 0; i < mask.length; i += 1) {
    const rgb = rgbAt(data, i);
    if (colourSeparation(rgb, body) <= 0.2) continue;
    if (colourSeparation(rgb, ground) <= 0.14) continue;
    candidates.push(i);
  }
  if (candidates.length < mask.length * 0.002) return null;

  const bodyMask = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i += 1) {
    if (mask[i] && colourSeparation(rgbAt(data, i), body) <= 0.2) bodyMask[i] = 1;
  }

  const candidateSet = new Uint8Array(mask.length);
  for (const i of candidates) candidateSet[i] = 1;

  const step = Math.max(1, Math.round(coreDepth * 0.4));
  const reach = Math.max(4, Math.round(coreDepth * 3));
  let best: ExtrusionEstimate | null = null;

  for (let dy = -reach; dy <= reach; dy += step) {
    for (let dx = -reach; dx <= reach; dx += step) {
      if (dx === 0 && dy === 0) continue;
      let hits = 0;
      let total = 0;
      let r = 0;
      let g = 0;
      let b = 0;
      for (let y = 0; y < height; y += 2) {
        for (let x = 0; x < width; x += 2) {
          if (!bodyMask[y * width + x]) continue;
          const ty = y + dy;
          const tx = x + dx;
          if (tx < 0 || ty < 0 || tx >= width || ty >= height) continue;
          const target = ty * width + tx;
          if (bodyMask[target]) continue; // still inside the body, tells us nothing
          total += 1;
          if (candidateSet[target]) {
            hits += 1;
            const rgb = rgbAt(data, target);
            r += rgb.r;
            g += rgb.g;
            b += rgb.b;
          }
        }
      }
      if (total < 40 || hits < 20) continue;
      const agreement = hits / total;
      if (agreement > (best?.agreement ?? 0.34)) {
        const rgb = { r: r / hits, g: g / hits, b: b / hits };
        best = {
          dx,
          dy,
          hex: toHex(rgb),
          agreement,
          hard: colourSeparation(rgb, body) > 0.3,
        };
      }
    }
  }
  return best;
}
