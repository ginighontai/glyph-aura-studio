import { kMeansPalette, luminance, toHex, type PaletteEntry, type Rgb } from './color';

export interface ImageLike {
  width: number;
  height: number;
  /** RGBA, 4 bytes per pixel. */
  data: Uint8ClampedArray | Uint8Array;
}

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface ShadowEstimate {
  dx: number;
  dy: number;
  strength: number;
  hex: string;
}

export interface ImageFeatures {
  width: number;
  height: number;
  aspect: number;
  hasAlpha: boolean;
  /** True when the lettering is darker than its background. */
  darkOnLight: boolean;
  threshold: number;
  inkCoverage: number;
  inkPalette: PaletteEntry[];
  backgroundPalette: PaletteEntry[];
  strokeWidthPx: number;
  strokeWidthP15: number;
  strokeWidthP85: number;
  strokeContrastRatio: number;
  edgeRoughness: number;
  slantDegrees: number;
  grainLevel: number;
  bbox: Box;
  lineBoxes: Box[];
  hierarchyLevels: number;
  alignment: 'left' | 'center' | 'right';
  marginRatio: number;
  /** 0–1 likelihood the script hangs from a horizontal headline (Indic). */
  headlineScore: number;
  inkGradient: { strength: number; angleDegrees: number };
  backgroundKind: 'flat' | 'linear' | 'radial' | 'vignette';
  backgroundAngleDegrees: number;
  glowLevel: number;
  shadow: ShadowEstimate | null;
  /** Ratio of stroke width to the tallest line — drives weight inference. */
  weightRatio: number;
}

const clamp = (value: number, min: number, max: number): number =>
  Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;

/* ------------------------------------------------------------------ sampling */

/** Area-average downscale; keeps colour statistics honest, unlike nearest. */
export function downscale(image: ImageLike, maxEdge: number): ImageLike {
  const factor = Math.max(image.width, image.height) / maxEdge;
  if (factor <= 1) return image;
  const width = Math.max(1, Math.round(image.width / factor));
  const height = Math.max(1, Math.round(image.height / factor));
  const out = new Uint8ClampedArray(width * height * 4);
  const xStep = image.width / width;
  const yStep = image.height / height;

  for (let y = 0; y < height; y += 1) {
    const srcY0 = Math.floor(y * yStep);
    const srcY1 = Math.max(srcY0 + 1, Math.floor((y + 1) * yStep));
    for (let x = 0; x < width; x += 1) {
      const srcX0 = Math.floor(x * xStep);
      const srcX1 = Math.max(srcX0 + 1, Math.floor((x + 1) * xStep));
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let count = 0;
      for (let sy = srcY0; sy < srcY1 && sy < image.height; sy += 1) {
        for (let sx = srcX0; sx < srcX1 && sx < image.width; sx += 1) {
          const index = (sy * image.width + sx) * 4;
          r += image.data[index];
          g += image.data[index + 1];
          b += image.data[index + 2];
          a += image.data[index + 3];
          count += 1;
        }
      }
      const target = (y * width + x) * 4;
      out[target] = r / count;
      out[target + 1] = g / count;
      out[target + 2] = b / count;
      out[target + 3] = a / count;
    }
  }
  return { width, height, data: out };
}

const pixelAt = (image: ImageLike, index: number): Rgb => ({
  r: image.data[index * 4],
  g: image.data[index * 4 + 1],
  b: image.data[index * 4 + 2],
});

function grayscale(image: ImageLike): Float32Array {
  const out = new Float32Array(image.width * image.height);
  for (let index = 0; index < out.length; index += 1) {
    const alpha = image.data[index * 4 + 3] / 255;
    // Composite over white so transparent stickers behave like art on paper.
    const rgb = pixelAt(image, index);
    out[index] = luminance(rgb) * alpha + 255 * (1 - alpha);
  }
  return out;
}

/** Otsu's method — maximises between-class variance of the grey histogram. */
export function otsuThreshold(gray: Float32Array): number {
  const histogram = new Array(256).fill(0);
  for (let index = 0; index < gray.length; index += 1) {
    histogram[clamp(Math.round(gray[index]), 0, 255)] += 1;
  }
  const total = gray.length;
  let sum = 0;
  for (let level = 0; level < 256; level += 1) sum += level * histogram[level];

  let sumB = 0;
  let weightB = 0;
  let bestVariance = -1;
  // High-contrast artwork produces a plateau of equally good thresholds (every
  // level between the two histogram spikes). Taking the midpoint of that plateau
  // keeps the mask centred instead of hugging the ink spike.
  let plateauStart = 0;
  let plateauEnd = 0;
  for (let level = 0; level < 256; level += 1) {
    weightB += histogram[level];
    if (weightB === 0) continue;
    const weightF = total - weightB;
    if (weightF === 0) break;
    sumB += level * histogram[level];
    const meanB = sumB / weightB;
    const meanF = (sum - sumB) / weightF;
    const variance = weightB * weightF * (meanB - meanF) ** 2;
    if (variance > bestVariance * 1.0000001) {
      bestVariance = variance;
      plateauStart = level;
      plateauEnd = level;
    } else if (variance >= bestVariance * 0.9999999) {
      plateauEnd = level;
    }
  }
  return Math.floor((plateauStart + plateauEnd) / 2);
}

/**
 * Box blur via a summed-area table — O(n) regardless of radius, which matters
 * because the radius here is a sizeable fraction of the image.
 */
function boxBlur(field: Float32Array, width: number, height: number, radius: number): Float32Array {
  const integral = new Float64Array((width + 1) * (height + 1));
  for (let y = 0; y < height; y += 1) {
    let rowSum = 0;
    for (let x = 0; x < width; x += 1) {
      rowSum += field[y * width + x];
      integral[(y + 1) * (width + 1) + (x + 1)] = integral[y * (width + 1) + (x + 1)] + rowSum;
    }
  }
  const out = new Float32Array(field.length);
  for (let y = 0; y < height; y += 1) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(height - 1, y + radius);
    for (let x = 0; x < width; x += 1) {
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(width - 1, x + radius);
      const area = (y1 - y0 + 1) * (x1 - x0 + 1);
      const sum =
        integral[(y1 + 1) * (width + 1) + (x1 + 1)] -
        integral[y0 * (width + 1) + (x1 + 1)] -
        integral[(y1 + 1) * (width + 1) + x0] +
        integral[y0 * (width + 1) + x0];
      out[y * width + x] = sum / area;
    }
  }
  return out;
}

/**
 * Flattens smooth illumination so lettering on a gradient or vignetted poster
 * still segments correctly: subtract a wide blur, keep the local detail.
 */
function localContrastField(gray: Float32Array, width: number, height: number): Float32Array {
  const radius = Math.max(6, Math.round(Math.max(width, height) / 7));
  const blurred = boxBlur(gray, width, height, radius);
  const out = new Float32Array(gray.length);
  for (let index = 0; index < gray.length; index += 1) {
    out[index] = gray[index] - blurred[index] + 128;
  }
  return out;
}

interface Segmentation {
  mask: Uint8Array;
  threshold: number;
  darkOnLight: boolean;
  coverage: number;
}

function segment(field: Float32Array, width: number, height: number): Segmentation {
  const threshold = otsuThreshold(field);

  // Whichever class hugs the frame is the background; that beats "the smaller
  // class is ink", which breaks on heavy poster lettering.
  let borderDark = 0;
  let borderTotal = 0;
  for (let x = 0; x < width; x += 1) {
    for (const y of [0, height - 1]) {
      if (field[y * width + x] <= threshold) borderDark += 1;
      borderTotal += 1;
    }
  }
  for (let y = 0; y < height; y += 1) {
    for (const x of [0, width - 1]) {
      if (field[y * width + x] <= threshold) borderDark += 1;
      borderTotal += 1;
    }
  }
  const darkOnLight = borderDark / Math.max(1, borderTotal) < 0.5;

  const mask = new Uint8Array(width * height);
  let inkCount = 0;
  for (let index = 0; index < mask.length; index += 1) {
    const isDark = field[index] <= threshold;
    const isInk = darkOnLight ? isDark : !isDark;
    mask[index] = isInk ? 1 : 0;
    if (isInk) inkCount += 1;
  }

  return { mask, threshold, darkOnLight, coverage: inkCount / mask.length };
}

const plausible = (coverage: number): boolean => coverage >= 0.004 && coverage <= 0.55;

/* ------------------------------------------------------------------- metrics */

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const index = clamp(Math.round((sorted.length - 1) * p), 0, sorted.length - 1);
  return sorted[index];
}

function runLengths(mask: Uint8Array, width: number, height: number): number[] {
  const runs: number[] = [];
  for (let y = 0; y < height; y += 1) {
    let run = 0;
    for (let x = 0; x < width; x += 1) {
      if (mask[y * width + x]) run += 1;
      else if (run) {
        runs.push(run);
        run = 0;
      }
    }
    if (run) runs.push(run);
  }
  for (let x = 0; x < width; x += 1) {
    let run = 0;
    for (let y = 0; y < height; y += 1) {
      if (mask[y * width + x]) run += 1;
      else if (run) {
        runs.push(run);
        run = 0;
      }
    }
    if (run) runs.push(run);
  }
  return runs;
}

/**
 * Estimates slant by shearing the ink mask and looking for the angle that makes
 * the vertical projection profile spikiest — stems line up at the true angle.
 */
function estimateSlant(mask: Uint8Array, width: number, height: number): number {
  let bestAngle = 0;
  let bestScore = -1;
  const centreY = height / 2;
  for (let angle = -32; angle <= 32; angle += 2) {
    const shear = Math.tan((angle * Math.PI) / 180);
    const columns = new Float64Array(width * 2);
    let total = 0;
    for (let y = 0; y < height; y += 1) {
      const offset = shear * (centreY - y);
      for (let x = 0; x < width; x += 1) {
        if (!mask[y * width + x]) continue;
        const shifted = Math.round(x + offset) + Math.floor(width / 2);
        if (shifted < 0 || shifted >= columns.length) continue;
        columns[shifted] += 1;
        total += 1;
      }
    }
    if (!total) continue;
    let mean = 0;
    for (let index = 0; index < columns.length; index += 1) mean += columns[index];
    mean /= columns.length;
    let variance = 0;
    for (let index = 0; index < columns.length; index += 1) {
      variance += (columns[index] - mean) ** 2;
    }
    const score = variance / columns.length / (mean * mean + 1);
    if (score > bestScore) {
      bestScore = score;
      bestAngle = angle;
    }
  }
  // Positive shear compensation means the strokes leaned the other way.
  return -bestAngle;
}

function boundingBox(mask: Uint8Array, width: number, height: number): Box {
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!mask[y * width + x]) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return { x0: 0, y0: 0, x1: width - 1, y1: height - 1 };
  return { x0, y0, x1, y1 };
}

function findLines(mask: Uint8Array, width: number, height: number, bbox: Box): Box[] {
  const rows = new Float64Array(height);
  let peak = 0;
  for (let y = bbox.y0; y <= bbox.y1; y += 1) {
    let count = 0;
    for (let x = bbox.x0; x <= bbox.x1; x += 1) if (mask[y * width + x]) count += 1;
    rows[y] = count;
    if (count > peak) peak = count;
  }
  if (!peak) return [{ ...bbox }];

  const cutoff = Math.max(1, peak * 0.06);
  const lines: Box[] = [];
  let start = -1;
  for (let y = bbox.y0; y <= bbox.y1 + 1; y += 1) {
    const active = y <= bbox.y1 && rows[y] >= cutoff;
    if (active && start === -1) start = y;
    if (!active && start !== -1) {
      const y1 = y - 1;
      if (y1 - start >= Math.max(2, height * 0.015)) {
        let lx0 = width;
        let lx1 = -1;
        for (let ly = start; ly <= y1; ly += 1) {
          for (let lx = bbox.x0; lx <= bbox.x1; lx += 1) {
            if (!mask[ly * width + lx]) continue;
            if (lx < lx0) lx0 = lx;
            if (lx > lx1) lx1 = lx;
          }
        }
        if (lx1 >= lx0) lines.push({ x0: lx0, y0: start, x1: lx1, y1 });
      }
      start = -1;
    }
  }
  return lines.length ? lines : [{ ...bbox }];
}

/**
 * Bengali and Devanagari hang their letters from a heavy horizontal headline
 * (matra / shirorekha). A sharp density spike in the top third of a text line is
 * a strong hint that the reference is Indic rather than Latin.
 */
function headlineScore(mask: Uint8Array, width: number, lines: Box[]): number {
  if (!lines.length) return 0;
  const tallest = lines.reduce((best, line) => (line.y1 - line.y0 > best.y1 - best.y0 ? line : best));
  const lineHeight = tallest.y1 - tallest.y0 + 1;
  if (lineHeight < 8) return 0;
  const profile: number[] = [];
  for (let y = tallest.y0; y <= tallest.y1; y += 1) {
    let count = 0;
    for (let x = tallest.x0; x <= tallest.x1; x += 1) if (mask[y * width + x]) count += 1;
    profile.push(count);
  }
  const sorted = [...profile].sort((a, b) => a - b);
  const median = percentile(sorted, 0.5) || 1;
  let peakIndex = 0;
  let peakValue = 0;
  profile.forEach((value, index) => {
    if (value > peakValue) {
      peakValue = value;
      peakIndex = index;
    }
  });
  const relativePosition = peakIndex / Math.max(1, profile.length - 1);
  const spikiness = peakValue / median;
  if (relativePosition > 0.42) return 0;
  return clamp((spikiness - 1.7) / 2.6, 0, 1);
}

function meanRgbOf(image: ImageLike, indices: number[]): Rgb {
  if (!indices.length) return { r: 0, g: 0, b: 0 };
  let r = 0;
  let g = 0;
  let b = 0;
  for (const index of indices) {
    r += image.data[index * 4];
    g += image.data[index * 4 + 1];
    b += image.data[index * 4 + 2];
  }
  return { r: r / indices.length, g: g / indices.length, b: b / indices.length };
}

/* ------------------------------------------------------------- main analysis */

export function extractFeatures(source: ImageLike): ImageFeatures {
  const image = downscale(source, 480);
  const { width, height } = image;
  const gray = grayscale(image);

  let hasAlpha = false;
  for (let index = 0; index < width * height; index += 1) {
    if (image.data[index * 4 + 3] < 250) {
      hasAlpha = true;
      break;
    }
  }

  // Prefer the illumination-flattened segmentation, but fall back to a plain
  // global threshold if it produces an implausible amount of ink.
  const adaptive = segment(localContrastField(gray, width, height), width, height);
  const global = segment(gray, width, height);
  const chosen = plausible(adaptive.coverage)
    ? adaptive
    : plausible(global.coverage)
      ? global
      : adaptive;

  const { mask, darkOnLight, threshold } = chosen;
  const inkCoverage = chosen.coverage;
  const inkCount = Math.round(inkCoverage * mask.length);

  /* palettes */
  const inkSamples: Rgb[] = [];
  const bgSamples: Rgb[] = [];
  const inkIndices: number[] = [];
  const bgIndices: number[] = [];
  const stride = Math.max(1, Math.floor(Math.sqrt(mask.length / 6000)));
  for (let index = 0; index < mask.length; index += stride) {
    const rgb = pixelAt(image, index);
    if (mask[index]) {
      inkSamples.push(rgb);
      inkIndices.push(index);
    } else {
      bgSamples.push(rgb);
      bgIndices.push(index);
    }
  }
  const inkPalette = kMeansPalette(inkSamples, 3);
  const backgroundPalette = kMeansPalette(bgSamples, 3);

  /* stroke geometry */
  const bbox = boundingBox(mask, width, height);
  const runs = runLengths(mask, width, height).sort((a, b) => a - b);
  const strokeWidthPx = Math.max(1, percentile(runs, 0.5));
  const strokeWidthP15 = Math.max(1, percentile(runs, 0.15));
  const strokeWidthP85 = Math.max(1, percentile(runs, 0.85));
  const strokeContrastRatio = clamp(strokeWidthP85 / strokeWidthP15, 1, 8);

  /* edge roughness: measured perimeter versus the perimeter a smooth stroke of
     this width would have */
  let perimeter = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (!mask[index]) continue;
      const up = y > 0 ? mask[index - width] : 0;
      const down = y < height - 1 ? mask[index + width] : 0;
      const left = x > 0 ? mask[index - 1] : 0;
      const right = x < width - 1 ? mask[index + 1] : 0;
      if (!up || !down || !left || !right) perimeter += 1;
    }
  }
  const expectedPerimeter = (2 * inkCount) / Math.max(1, strokeWidthPx);
  const edgeRoughness = clamp(perimeter / Math.max(1, expectedPerimeter) - 1, 0, 1);

  /* slant, lines, composition */
  const slantDegrees = estimateSlant(mask, width, height);
  const lineBoxes = findLines(mask, width, height, bbox);
  const lineHeights = lineBoxes.map((line) => line.y1 - line.y0 + 1).sort((a, b) => b - a);
  const hierarchyLevels = lineHeights.reduce<number[]>((levels, value) => {
    if (!levels.some((existing) => Math.abs(existing - value) / Math.max(existing, value) < 0.25)) {
      levels.push(value);
    }
    return levels;
  }, []).length;

  const centres = lineBoxes.map((line) => (line.x0 + line.x1) / 2);
  const variance = (values: number[]): number => {
    if (values.length < 2) return Number.POSITIVE_INFINITY;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    return values.reduce((acc, value) => acc + (value - mean) ** 2, 0) / values.length;
  };
  let alignment: ImageFeatures['alignment'] = 'center';
  if (lineBoxes.length > 1) {
    const options: Array<[ImageFeatures['alignment'], number]> = [
      ['left', variance(lineBoxes.map((line) => line.x0))],
      ['right', variance(lineBoxes.map((line) => line.x1))],
      ['center', variance(centres)],
    ];
    options.sort((a, b) => a[1] - b[1]);
    alignment = options[0][0];
  } else {
    const centreOffset = (bbox.x0 + bbox.x1) / 2 - width / 2;
    if (Math.abs(centreOffset) > width * 0.08) alignment = centreOffset < 0 ? 'left' : 'right';
  }

  const marginRatio = clamp(
    Math.min(bbox.x0, width - 1 - bbox.x1) / width,
    0.02,
    0.3,
  );

  /* grain: high-frequency energy in the background only */
  let grainEnergy = 0;
  let grainSamples = 0;
  for (let y = 1; y < height - 1; y += 2) {
    for (let x = 1; x < width - 1; x += 2) {
      const index = y * width + x;
      if (mask[index]) continue;
      const laplacian =
        4 * gray[index] - gray[index - 1] - gray[index + 1] - gray[index - width] - gray[index + width];
      grainEnergy += Math.abs(laplacian);
      grainSamples += 1;
    }
  }
  const grainLevel = clamp(grainEnergy / Math.max(1, grainSamples) / 26, 0, 1);

  /* gradient across the lettering */
  const inkTop = inkIndices.filter((index) => Math.floor(index / width) < (bbox.y0 + bbox.y1) / 2);
  const inkBottom = inkIndices.filter((index) => Math.floor(index / width) >= (bbox.y0 + bbox.y1) / 2);
  const inkLeft = inkIndices.filter((index) => index % width < (bbox.x0 + bbox.x1) / 2);
  const inkRight = inkIndices.filter((index) => index % width >= (bbox.x0 + bbox.x1) / 2);
  const topRgb = meanRgbOf(image, inkTop);
  const bottomRgb = meanRgbOf(image, inkBottom);
  const leftRgb = meanRgbOf(image, inkLeft);
  const rightRgb = meanRgbOf(image, inkRight);
  const verticalDelta = luminance(bottomRgb) - luminance(topRgb);
  const horizontalDelta = luminance(rightRgb) - luminance(leftRgb);
  const gradientMagnitude = Math.hypot(verticalDelta, horizontalDelta);
  const inkGradient = {
    strength: clamp(gradientMagnitude / 90, 0, 1),
    angleDegrees: (Math.atan2(verticalDelta, horizontalDelta) * 180) / Math.PI,
  };

  /* background structure from corner / centre sampling */
  const sampleRegion = (cx: number, cy: number): Rgb => {
    const indices: number[] = [];
    const radius = Math.max(2, Math.round(Math.min(width, height) * 0.06));
    for (let y = cy - radius; y <= cy + radius; y += 1) {
      for (let x = cx - radius; x <= cx + radius; x += 1) {
        if (x < 0 || y < 0 || x >= width || y >= height) continue;
        const index = y * width + x;
        if (mask[index]) continue;
        indices.push(index);
      }
    }
    return meanRgbOf(image, indices);
  };
  const corners = [
    sampleRegion(Math.round(width * 0.08), Math.round(height * 0.08)),
    sampleRegion(Math.round(width * 0.92), Math.round(height * 0.08)),
    sampleRegion(Math.round(width * 0.08), Math.round(height * 0.92)),
    sampleRegion(Math.round(width * 0.92), Math.round(height * 0.92)),
  ];
  const centreRgb = sampleRegion(Math.round(width / 2), Math.round(height / 2));
  const cornerLums = corners.map(luminance);
  const cornerSpread = Math.max(...cornerLums) - Math.min(...cornerLums);
  const cornerMean = cornerLums.reduce((a, b) => a + b, 0) / cornerLums.length;
  const centreDelta = luminance(centreRgb) - cornerMean;
  let backgroundKind: ImageFeatures['backgroundKind'] = 'flat';
  if (Math.abs(centreDelta) > 16 && Math.abs(centreDelta) > cornerSpread) {
    backgroundKind = centreDelta > 0 ? 'radial' : 'vignette';
  } else if (cornerSpread > 14) {
    backgroundKind = 'linear';
  }
  const backgroundAngleDegrees =
    (Math.atan2(
      (cornerLums[2] + cornerLums[3]) / 2 - (cornerLums[0] + cornerLums[1]) / 2,
      (cornerLums[1] + cornerLums[3]) / 2 - (cornerLums[0] + cornerLums[2]) / 2,
    ) *
      180) /
    Math.PI;

  /* glow: is the background immediately around the ink pulled towards the ink
     colour? */
  const ringInner = new Uint8Array(mask.length);
  const radius = Math.max(2, Math.round(strokeWidthPx));
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (mask[index]) continue;
      let near = false;
      for (let dy = -radius; dy <= radius && !near; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          const ny = y + dy;
          const nx = x + dx;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          if (mask[ny * width + nx]) {
            near = true;
            break;
          }
        }
      }
      if (near) ringInner[index] = 1;
    }
  }
  const nearIndices: number[] = [];
  const farIndices: number[] = [];
  for (let index = 0; index < mask.length; index += 1) {
    if (mask[index]) continue;
    if (ringInner[index]) nearIndices.push(index);
    else farIndices.push(index);
  }
  const nearLum = luminance(meanRgbOf(image, nearIndices));
  const farLum = luminance(meanRgbOf(image, farIndices));
  const inkLum = luminance(meanRgbOf(image, inkIndices));
  const towardsInk = (nearLum - farLum) / (inkLum - farLum || 1);
  const glowLevel = clamp(towardsInk * 1.4, 0, 1);

  /* shadow: intermediate-tone pixels next to the ink, offset from its centroid */
  let shadow: ShadowEstimate | null = null;
  if (nearIndices.length > 24) {
    const midLow = Math.min(inkLum, farLum) + Math.abs(inkLum - farLum) * 0.25;
    const midHigh = Math.min(inkLum, farLum) + Math.abs(inkLum - farLum) * 0.75;
    const shadowIndices = nearIndices.filter((index) => {
      const value = gray[index];
      return value > midLow && value < midHigh;
    });
    if (shadowIndices.length > nearIndices.length * 0.12) {
      let sx = 0;
      let sy = 0;
      for (const index of shadowIndices) {
        sx += index % width;
        sy += Math.floor(index / width);
      }
      sx /= shadowIndices.length;
      sy /= shadowIndices.length;
      let ix = 0;
      let iy = 0;
      for (const index of inkIndices) {
        ix += index % width;
        iy += Math.floor(index / width);
      }
      ix /= Math.max(1, inkIndices.length);
      iy /= Math.max(1, inkIndices.length);
      const dx = (sx - ix) / Math.max(1, strokeWidthPx);
      const dy = (sy - iy) / Math.max(1, strokeWidthPx);
      if (Math.hypot(dx, dy) > 0.12) {
        shadow = {
          dx: clamp(dx, -4, 4),
          dy: clamp(dy, -4, 4),
          strength: clamp(shadowIndices.length / nearIndices.length, 0, 1),
          hex: toHex(meanRgbOf(image, shadowIndices)),
        };
      }
    }
  }

  const tallestLine = lineBoxes.reduce(
    (best, line) => Math.max(best, line.y1 - line.y0 + 1),
    1,
  );

  return {
    width: source.width,
    height: source.height,
    aspect: source.width / Math.max(1, source.height),
    hasAlpha,
    darkOnLight,
    threshold,
    inkCoverage,
    inkPalette,
    backgroundPalette,
    strokeWidthPx,
    strokeWidthP15,
    strokeWidthP85,
    strokeContrastRatio,
    edgeRoughness,
    slantDegrees,
    grainLevel,
    bbox,
    lineBoxes,
    hierarchyLevels: Math.max(1, hierarchyLevels),
    alignment,
    marginRatio,
    headlineScore: headlineScore(mask, width, lineBoxes),
    inkGradient,
    backgroundKind,
    backgroundAngleDegrees,
    glowLevel,
    shadow,
    weightRatio: clamp(strokeWidthPx / tallestLine, 0.01, 0.6),
  };
}
