export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface PaletteEntry {
  hex: string;
  rgb: Rgb;
  /** Share of the sampled pixels this cluster owns, 0–1. */
  weight: number;
}

const clamp255 = (value: number): number => Math.max(0, Math.min(255, Math.round(value)));

export const toHex = ({ r, g, b }: Rgb): string =>
  `#${[r, g, b].map((channel) => clamp255(channel).toString(16).padStart(2, '0')).join('')}`;

export function hexToRgb(hex: string): Rgb {
  const cleaned = hex.replace('#', '');
  const full =
    cleaned.length === 3
      ? cleaned
          .split('')
          .map((char) => char + char)
          .join('')
      : cleaned.slice(0, 6);
  const value = Number.parseInt(full, 16);
  if (!Number.isFinite(value)) return { r: 0, g: 0, b: 0 };
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

export const luminance = ({ r, g, b }: Rgb): number => 0.2126 * r + 0.7152 * g + 0.0722 * b;

export const relativeLuminance = (rgb: Rgb): number => luminance(rgb) / 255;

/** WCAG contrast ratio between two colours, 1–21. */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const channel = (value: number): number => {
    const scaled = value / 255;
    return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
  };
  const lum = (rgb: Rgb): number =>
    0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
  const first = lum(a);
  const second = lum(b);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

export const distance = (a: Rgb, b: Rgb): number =>
  (a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2;

export function mixRgb(a: Rgb, b: Rgb, amount: number): Rgb {
  return {
    r: a.r + (b.r - a.r) * amount,
    g: a.g + (b.g - a.g) * amount,
    b: a.b + (b.b - a.b) * amount,
  };
}

export const lighten = (rgb: Rgb, amount: number): Rgb =>
  mixRgb(rgb, { r: 255, g: 255, b: 255 }, amount);

export const darken = (rgb: Rgb, amount: number): Rgb => mixRgb(rgb, { r: 0, g: 0, b: 0 }, amount);

export function withAlpha(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha)).toFixed(3)})`;
}

/**
 * k-means palette extraction with deterministic, spread-out seeding so the same
 * reference image always produces the same palette (important: the Style DNA is
 * shown to the user and must not shimmer between runs).
 */
export function kMeansPalette(samples: Rgb[], k = 4, iterations = 12): PaletteEntry[] {
  if (!samples.length) return [];
  const clusters = Math.max(1, Math.min(k, samples.length));

  // Deterministic seeding: farthest-point sampling from the mean.
  const mean = samples.reduce(
    (acc, sample) => ({ r: acc.r + sample.r, g: acc.g + sample.g, b: acc.b + sample.b }),
    { r: 0, g: 0, b: 0 },
  );
  mean.r /= samples.length;
  mean.g /= samples.length;
  mean.b /= samples.length;

  const centroids: Rgb[] = [];
  let seed = samples.reduce(
    (best, sample) => (distance(sample, mean) > distance(best, mean) ? sample : best),
    samples[0],
  );
  centroids.push({ ...seed });
  while (centroids.length < clusters) {
    let farthest = samples[0];
    let farthestScore = -1;
    for (const sample of samples) {
      let nearest = Infinity;
      for (const centroid of centroids) nearest = Math.min(nearest, distance(sample, centroid));
      if (nearest > farthestScore) {
        farthestScore = nearest;
        farthest = sample;
      }
    }
    centroids.push({ ...farthest });
  }

  const assignments = new Int32Array(samples.length);
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    let moved = false;
    for (let index = 0; index < samples.length; index += 1) {
      let best = 0;
      let bestDistance = Infinity;
      for (let c = 0; c < centroids.length; c += 1) {
        const value = distance(samples[index], centroids[c]);
        if (value < bestDistance) {
          bestDistance = value;
          best = c;
        }
      }
      if (assignments[index] !== best) {
        assignments[index] = best;
        moved = true;
      }
    }
    const sums = centroids.map(() => ({ r: 0, g: 0, b: 0, count: 0 }));
    for (let index = 0; index < samples.length; index += 1) {
      const bucket = sums[assignments[index]];
      bucket.r += samples[index].r;
      bucket.g += samples[index].g;
      bucket.b += samples[index].b;
      bucket.count += 1;
    }
    for (let c = 0; c < centroids.length; c += 1) {
      if (sums[c].count === 0) continue;
      centroids[c] = {
        r: sums[c].r / sums[c].count,
        g: sums[c].g / sums[c].count,
        b: sums[c].b / sums[c].count,
      };
    }
    if (!moved && iteration > 1) break;
  }

  const counts = new Array(centroids.length).fill(0);
  for (let index = 0; index < samples.length; index += 1) counts[assignments[index]] += 1;

  return centroids
    .map((centroid, index) => ({
      rgb: { r: clamp255(centroid.r), g: clamp255(centroid.g), b: clamp255(centroid.b) },
      hex: toHex(centroid),
      weight: counts[index] / samples.length,
    }))
    .filter((entry) => entry.weight > 0.01)
    .sort((a, b) => b.weight - a.weight);
}

/** Human-readable colour name for the Style DNA panel. */
export function describeColor(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2 / 255;
  const saturation = max === min ? 0 : (max - min) / (255 - Math.abs(max + min - 255));

  if (saturation < 0.12) {
    if (lightness > 0.94) return 'near-white';
    if (lightness > 0.78) return 'pale grey';
    if (lightness > 0.55) return 'silver';
    if (lightness > 0.33) return 'mid grey';
    if (lightness > 0.14) return 'graphite';
    return 'near-black';
  }

  let hue = 0;
  if (max === r) hue = ((g - b) / (max - min) + 6) % 6;
  else if (max === g) hue = (b - r) / (max - min) + 2;
  else hue = (r - g) / (max - min) + 4;
  hue *= 60;

  const names: Array<[number, string]> = [
    [15, 'red'],
    [40, 'orange'],
    [62, 'gold'],
    [85, 'chartreuse'],
    [160, 'green'],
    [190, 'teal'],
    [215, 'azure'],
    [250, 'blue'],
    [280, 'indigo'],
    [310, 'violet'],
    [340, 'magenta'],
    [360, 'red'],
  ];
  const base = names.find(([limit]) => hue <= limit)?.[1] ?? 'red';
  const tone = lightness > 0.72 ? 'light ' : lightness < 0.3 ? 'deep ' : '';
  const intensity = saturation > 0.75 ? 'vivid ' : saturation < 0.3 ? 'muted ' : '';
  return `${tone}${intensity}${base}`.trim();
}
