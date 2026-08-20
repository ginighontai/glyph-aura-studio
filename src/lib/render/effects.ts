/**
 * Canvas effect kit: substrate texture, grain, ink bleed, dry-brush erosion,
 * emboss and vignette.
 *
 * Two rules run through all of it. Everything is deterministic (seeded noise),
 * so re-rendering the same poster twice gives the identical file. And every
 * effect is expressed as a function of the em size, so a 1× preview and a 4×
 * export look like the same artwork rather than the same pixels.
 */

export interface Layer {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
}

export function createLayer(width: number, height: number): Layer {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas 2D is unavailable in this browser.');
  return { canvas, ctx, width: canvas.width, height: canvas.height };
}

/**
 * Releases a layer's backing store immediately.
 *
 * A 4× A4 poster is ~35 megapixels, i.e. ~140 MB per layer. The renderer builds
 * several temporaries (blurred shadow, tinted glow, outline pass), and browsers
 * will not reclaim them until GC decides to — which is far too late if you are
 * mid-export. Resizing a canvas to 0 frees it there and then.
 */
export function disposeLayer(layer: Layer): void {
  layer.canvas.width = 0;
  layer.canvas.height = 0;
}

let filterSupport: boolean | null = null;
export function supportsCanvasFilter(): boolean {
  if (filterSupport !== null) return filterSupport;
  try {
    const probe = createLayer(2, 2);
    filterSupport = typeof probe.ctx.filter === 'string';
  } catch {
    filterSupport = false;
  }
  return filterSupport;
}

/**
 * Gaussian-ish blur. Uses the native canvas filter where available and falls
 * back to a downsample/upsample pyramid elsewhere (Safari has been late to
 * canvas filters, and a poster that silently loses its glow is worse than a
 * slightly cheaper blur).
 */
export function blurredCopy(source: Layer, radiusPx: number): Layer {
  const radius = Math.max(0, radiusPx);
  const out = createLayer(source.width, source.height);
  if (radius < 0.4) {
    out.ctx.drawImage(source.canvas, 0, 0);
    return out;
  }

  if (supportsCanvasFilter()) {
    out.ctx.filter = `blur(${radius.toFixed(2)}px)`;
    out.ctx.drawImage(source.canvas, 0, 0);
    out.ctx.filter = 'none';
    return out;
  }

  const factor = Math.max(2, Math.min(16, radius));
  const small = createLayer(
    Math.max(1, Math.round(source.width / factor)),
    Math.max(1, Math.round(source.height / factor)),
  );
  small.ctx.imageSmoothingEnabled = true;
  small.ctx.imageSmoothingQuality = 'high';
  small.ctx.drawImage(source.canvas, 0, 0, small.width, small.height);
  out.ctx.imageSmoothingEnabled = true;
  out.ctx.imageSmoothingQuality = 'high';
  for (let pass = 0; pass < 2; pass += 1) {
    out.ctx.drawImage(small.canvas, 0, 0, out.width, out.height);
  }
  disposeLayer(small);
  return out;
}

/* -------------------------------------------------------------------- noise */

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface NoiseGrid {
  values: Float32Array;
  cols: number;
  rows: number;
  cell: number;
}

function noiseGrid(width: number, height: number, cell: number, seed: number): NoiseGrid {
  const cols = Math.max(2, Math.ceil(width / cell) + 2);
  const rows = Math.max(2, Math.ceil(height / cell) + 2);
  const random = mulberry32(seed);
  const values = new Float32Array(cols * rows);
  for (let index = 0; index < values.length; index += 1) values[index] = random();
  return { values, cols, rows, cell };
}

const smooth = (t: number): number => t * t * (3 - 2 * t);

function sampleGrid(grid: NoiseGrid, x: number, y: number): number {
  const gx = x / grid.cell;
  const gy = y / grid.cell;
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const tx = smooth(gx - x0);
  const ty = smooth(gy - y0);
  const cx0 = Math.min(grid.cols - 1, Math.max(0, x0));
  const cy0 = Math.min(grid.rows - 1, Math.max(0, y0));
  const cx1 = Math.min(grid.cols - 1, cx0 + 1);
  const cy1 = Math.min(grid.rows - 1, cy0 + 1);
  const v00 = grid.values[cy0 * grid.cols + cx0];
  const v10 = grid.values[cy0 * grid.cols + cx1];
  const v01 = grid.values[cy1 * grid.cols + cx0];
  const v11 = grid.values[cy1 * grid.cols + cx1];
  return (v00 * (1 - tx) + v10 * tx) * (1 - ty) + (v01 * (1 - tx) + v11 * tx) * ty;
}

/** Fractal value noise sampler with optional directional stretching. */
export function makeNoiseSampler(options: {
  width: number;
  height: number;
  cell: number;
  seed: number;
  octaves?: number;
  angleDegrees?: number;
  stretch?: number;
}): (x: number, y: number) => number {
  const octaves = options.octaves ?? 3;
  const angle = ((options.angleDegrees ?? 0) * Math.PI) / 180;
  const stretch = options.stretch ?? 1;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const grids: NoiseGrid[] = [];
  let cell = options.cell;
  for (let octave = 0; octave < octaves; octave += 1) {
    grids.push(noiseGrid(options.width * 1.5, options.height * 1.5, Math.max(1.5, cell), options.seed + octave * 977));
    cell /= 2.1;
  }

  return (x: number, y: number): number => {
    // Rotate into the pen frame, then squash across it so streaks run with the stroke.
    const rx = (x * cos + y * sin) / stretch;
    const ry = -x * sin + y * cos;
    let sum = 0;
    let amplitude = 1;
    let total = 0;
    for (const grid of grids) {
      sum += sampleGrid(grid, rx, ry) * amplitude;
      total += amplitude;
      amplitude *= 0.5;
    }
    return sum / total;
  };
}

/* ------------------------------------------------------------ ink treatments */

const MAX_PIXEL_OPS = 42_000_000;

export const canRunPixelEffects = (width: number, height: number): boolean =>
  width * height <= MAX_PIXEL_OPS;

/**
 * Dry-brush erosion. Eats holes out of the stroke interior where the (stretched)
 * noise field is low, and nibbles the anti-aliased edges, which is what a brush
 * running out of ink actually does.
 */
export function applyDryBrush(
  layer: Layer,
  amount: number,
  options: { penAngleDegrees: number; emSize: number; seed?: number },
): void {
  if (amount <= 0.01 || !canRunPixelEffects(layer.width, layer.height)) return;

  const image = layer.ctx.getImageData(0, 0, layer.width, layer.height);
  const { data } = image;
  const noise = makeNoiseSampler({
    width: layer.width,
    height: layer.height,
    cell: Math.max(2.5, options.emSize * 0.055),
    seed: options.seed ?? 1337,
    octaves: 3,
    angleDegrees: options.penAngleDegrees,
    stretch: 3.4,
  });

  const holeCut = amount * 0.42;
  const edgeBite = amount * 0.75;

  for (let y = 0; y < layer.height; y += 1) {
    for (let x = 0; x < layer.width; x += 1) {
      const index = (y * layer.width + x) * 4 + 3;
      const alpha = data[index];
      if (alpha === 0) continue;
      const n = noise(x, y);
      let scale = 1;
      if (n < holeCut) {
        scale = Math.max(0, n / Math.max(holeCut, 1e-6)) ** 1.7;
      }
      if (alpha < 250) {
        scale *= 1 - edgeBite * (1 - n) * (1 - alpha / 255);
      }
      data[index] = Math.max(0, Math.min(255, alpha * scale));
    }
  }
  layer.ctx.putImageData(image, 0, 0);
}

/** Speckles of ink thrown just outside the strokes, as wet media does. */
export function addInkSpeckle(
  layer: Layer,
  amount: number,
  color: string,
  options: { emSize: number; seed?: number },
): void {
  if (amount <= 0.02) return;
  const random = mulberry32(options.seed ?? 4242);
  const count = Math.round(amount * (layer.width * layer.height) / 26000);
  layer.ctx.save();
  layer.ctx.fillStyle = color;
  for (let index = 0; index < count; index += 1) {
    const x = random() * layer.width;
    const y = random() * layer.height;
    const radius = Math.max(0.4, random() ** 3 * options.emSize * 0.035);
    layer.ctx.globalAlpha = 0.18 + random() * 0.5;
    layer.ctx.beginPath();
    layer.ctx.arc(x, y, radius, 0, Math.PI * 2);
    layer.ctx.fill();
  }
  layer.ctx.restore();
}

/** Inner bevel driven by the lighting direction the analyst reported. */
export function applyEmboss(layer: Layer, strength: number, lightAngleDegrees = -45): void {
  if (strength <= 0.02) return;
  const offset = Math.max(1, layer.width * 0.0012 + strength * 2.2);
  const angle = (lightAngleDegrees * Math.PI) / 180;
  const dx = Math.cos(angle) * offset;
  const dy = Math.sin(angle) * offset;

  // Lit edge: the glyph shape shifted towards the light, tinted white.
  const highlight = createLayer(layer.width, layer.height);
  highlight.ctx.drawImage(layer.canvas, dx, dy);
  highlight.ctx.globalCompositeOperation = 'source-in';
  highlight.ctx.fillStyle = `rgba(255,255,255,${Math.min(0.9, strength * 0.8).toFixed(3)})`;
  highlight.ctx.fillRect(0, 0, layer.width, layer.height);

  // Shaded edge: the same shape shifted away from the light, tinted black.
  const shade = createLayer(layer.width, layer.height);
  shade.ctx.drawImage(layer.canvas, -dx, -dy);
  shade.ctx.globalCompositeOperation = 'source-in';
  shade.ctx.fillStyle = `rgba(0,0,0,${Math.min(0.8, strength * 0.6).toFixed(3)})`;
  shade.ctx.fillRect(0, 0, layer.width, layer.height);

  layer.ctx.save();
  // `source-atop` keeps the bevel strictly inside the letters.
  layer.ctx.globalCompositeOperation = 'source-atop';
  layer.ctx.drawImage(shade.canvas, 0, 0);
  layer.ctx.drawImage(highlight.canvas, 0, 0);
  layer.ctx.restore();

  disposeLayer(highlight);
  disposeLayer(shade);
}

/* ------------------------------------------------------------ substrate work */

/** Paper tooth: soft mottling plus faint fibres, multiplied into the ground. */
export function paintPaperTexture(
  target: Layer,
  intensity: number,
  options: { seed?: number; dark: boolean },
): void {
  if (intensity <= 0.02) return;
  const scale = Math.max(1, Math.round(Math.max(target.width, target.height) / 900));
  const tile = createLayer(Math.ceil(target.width / scale), Math.ceil(target.height / scale));
  const image = tile.ctx.createImageData(tile.width, tile.height);
  const mottle = makeNoiseSampler({
    width: tile.width,
    height: tile.height,
    cell: Math.max(3, tile.width / 90),
    seed: options.seed ?? 20260820,
    octaves: 4,
  });
  const fibre = makeNoiseSampler({
    width: tile.width,
    height: tile.height,
    cell: 3.2,
    seed: (options.seed ?? 20260820) + 31,
    octaves: 2,
    angleDegrees: 6,
    stretch: 9,
  });

  const swing = 46 * intensity;
  for (let y = 0; y < tile.height; y += 1) {
    for (let x = 0; x < tile.width; x += 1) {
      const index = (y * tile.width + x) * 4;
      const value = mottle(x, y) * 0.72 + fibre(x, y) * 0.28;
      const delta = (value - 0.5) * swing;
      const base = 128 + delta;
      image.data[index] = base;
      image.data[index + 1] = base;
      image.data[index + 2] = base;
      image.data[index + 3] = 255;
    }
  }
  tile.ctx.putImageData(image, 0, 0);

  target.ctx.save();
  target.ctx.globalCompositeOperation = options.dark ? 'lighten' : 'overlay';
  target.ctx.globalAlpha = Math.min(0.9, 0.35 + intensity * 0.5);
  target.ctx.imageSmoothingEnabled = true;
  target.ctx.drawImage(tile.canvas, 0, 0, target.width, target.height);
  target.ctx.restore();
  disposeLayer(tile);
}

/** Fine film grain across the whole poster. */
export function paintGrain(target: Layer, intensity: number, seed = 9091): void {
  if (intensity <= 0.02) return;
  const maxEdge = 1400;
  const scale = Math.max(1, Math.max(target.width, target.height) / maxEdge);
  const tile = createLayer(Math.ceil(target.width / scale), Math.ceil(target.height / scale));
  const image = tile.ctx.createImageData(tile.width, tile.height);
  const random = mulberry32(seed);
  const swing = 120 * intensity;
  for (let index = 0; index < tile.width * tile.height; index += 1) {
    const value = 128 + (random() - 0.5) * swing;
    image.data[index * 4] = value;
    image.data[index * 4 + 1] = value;
    image.data[index * 4 + 2] = value;
    image.data[index * 4 + 3] = 255;
  }
  tile.ctx.putImageData(image, 0, 0);

  target.ctx.save();
  target.ctx.globalCompositeOperation = 'overlay';
  target.ctx.globalAlpha = Math.min(0.55, 0.12 + intensity * 0.3);
  target.ctx.drawImage(tile.canvas, 0, 0, target.width, target.height);
  target.ctx.restore();
  disposeLayer(tile);
}

export function paintVignette(target: Layer, strength: number, base: string): void {
  if (strength <= 0.02) return;
  const gradient = target.ctx.createRadialGradient(
    target.width / 2,
    target.height / 2,
    Math.min(target.width, target.height) * 0.15,
    target.width / 2,
    target.height / 2,
    Math.hypot(target.width, target.height) * 0.62,
  );
  gradient.addColorStop(0, 'rgba(0,0,0,0)');
  gradient.addColorStop(1, base);
  target.ctx.save();
  target.ctx.globalAlpha = Math.min(0.85, strength);
  target.ctx.fillStyle = gradient;
  target.ctx.fillRect(0, 0, target.width, target.height);
  target.ctx.restore();
}
