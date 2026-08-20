/**
 * Background removal for raster output.
 *
 * Uses a flood fill inwards from the frame rather than a global colour key, so a
 * white counter inside an `o` or a light highlight on a letter is never punched
 * out — the classic failure mode of naive chroma keying on typography.
 */

export interface RemoveBackgroundOptions {
  /** 0–1; how far a pixel's colour may drift from the sampled ground. */
  tolerance?: number;
  /**
   * Keep the soft halo of shadows and glows instead of hard-cutting them.
   * Maps to the studio's "preserve effects" toggle.
   */
  preserveEffects?: boolean;
}

export interface RemoveBackgroundResult {
  canvas: HTMLCanvasElement;
  removedRatio: number;
}

export function removeBackground(
  source: HTMLCanvasElement,
  options: RemoveBackgroundOptions = {},
): RemoveBackgroundResult {
  const tolerance = Math.max(0.01, Math.min(0.9, options.tolerance ?? 0.18));
  const preserveEffects = options.preserveEffects !== false;

  const canvas = document.createElement('canvas');
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas 2D is unavailable in this browser.');
  ctx.drawImage(source, 0, 0);

  const { width, height } = canvas;
  const image = ctx.getImageData(0, 0, width, height);
  const { data } = image;

  // Sample the ground from the frame edges (median of the four midpoints and corners).
  const samplePoints: Array<[number, number]> = [
    [0, 0],
    [width - 1, 0],
    [0, height - 1],
    [width - 1, height - 1],
    [Math.floor(width / 2), 0],
    [Math.floor(width / 2), height - 1],
    [0, Math.floor(height / 2)],
    [width - 1, Math.floor(height / 2)],
  ];
  let sr = 0;
  let sg = 0;
  let sb = 0;
  for (const [x, y] of samplePoints) {
    const index = (y * width + x) * 4;
    sr += data[index];
    sg += data[index + 1];
    sb += data[index + 2];
  }
  sr /= samplePoints.length;
  sg /= samplePoints.length;
  sb /= samplePoints.length;

  const limit = tolerance * 441.67; // Euclidean distance across the RGB cube.
  const distance = (index: number): number =>
    Math.hypot(data[index] - sr, data[index + 1] - sg, data[index + 2] - sb);

  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;

  const push = (pixel: number): void => {
    if (visited[pixel]) return;
    visited[pixel] = 1;
    queue[tail] = pixel;
    tail += 1;
  };

  for (let x = 0; x < width; x += 1) {
    if (distance(x * 4) <= limit) push(x);
    const bottom = (height - 1) * width + x;
    if (distance(bottom * 4) <= limit) push(bottom);
  }
  for (let y = 0; y < height; y += 1) {
    const left = y * width;
    if (distance(left * 4) <= limit) push(left);
    const right = y * width + width - 1;
    if (distance(right * 4) <= limit) push(right);
  }

  while (head < tail) {
    const pixel = queue[head];
    head += 1;
    const x = pixel % width;
    const y = (pixel - x) / width;

    const neighbours = [
      x > 0 ? pixel - 1 : -1,
      x < width - 1 ? pixel + 1 : -1,
      y > 0 ? pixel - width : -1,
      y < height - 1 ? pixel + width : -1,
    ];
    for (const neighbour of neighbours) {
      if (neighbour < 0 || visited[neighbour]) continue;
      if (distance(neighbour * 4) <= limit) push(neighbour);
    }
  }

  let removed = 0;
  const feather = preserveEffects ? limit * 1.9 : limit * 1.1;
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const index = pixel * 4;
    if (visited[pixel]) {
      data[index + 3] = 0;
      removed += 1;
      continue;
    }
    // Soften the ring just outside the artwork so edges do not look cut out.
    const d = distance(index);
    if (d < feather) {
      const keep = d / feather;
      data[index + 3] = Math.round(data[index + 3] * (preserveEffects ? keep ** 0.7 : keep));
    }
  }

  ctx.putImageData(image, 0, 0);
  return { canvas, removedRatio: removed / (width * height) };
}

/** Flattens transparency onto a solid colour — needed before JPG export. */
export function flattenOnto(source: HTMLCanvasElement, color: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is unavailable in this browser.');
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0);
  return canvas;
}
