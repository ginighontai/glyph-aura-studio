import { FONT_MANIFEST } from '@/generated/font-manifest';
import type { ScriptId } from '@/types/project';
import type { FontCategory, StyleDna } from '@/types/styleDna';

export interface BundledFont {
  id: string;
  family: string;
  file: string;
  scripts: ScriptId[];
  category: FontCategory;
  /** 1 monoline … 5 extreme thick/thin modulation. */
  contrast: number;
  weightMin: number;
  weightMax: number;
  variable: boolean;
  caps: boolean;
  optical: number;
  tags: string[];
  note: string;
  licenseFile: string;
  upstream: string;
}

export const FONT_LIBRARY = FONT_MANIFEST.fonts as unknown as BundledFont[];
export const FONT_LICENSE = FONT_MANIFEST.license;
export const FONT_SOURCE = FONT_MANIFEST.source;

export const fontById = (id: string): BundledFont | undefined =>
  FONT_LIBRARY.find((font) => font.id === id);

export const fontsForScript = (script: ScriptId): BundledFont[] =>
  FONT_LIBRARY.filter((font) => font.scripts.includes(script));

/** How interchangeable two shape families are when the ideal one is missing. */
const AFFINITY: Partial<Record<FontCategory, Partial<Record<FontCategory, number>>>> = {
  serif: { slab: 20, display: 12, script: 8 },
  sans: { rounded: 16, display: 12, slab: 8 },
  slab: { serif: 20, display: 12 },
  display: { serif: 12, sans: 12, slab: 12, rounded: 8 },
  script: { brush: 24, handwriting: 16, serif: 8 },
  brush: { script: 24, handwriting: 20, display: 8 },
  handwriting: { brush: 20, script: 16 },
  blackletter: { serif: 10, script: 8 },
  rounded: { sans: 16, display: 10 },
  monospace: { sans: 12 },
};

const targetContrastBand = (ratio: number): number => {
  if (ratio < 1.3) return 1;
  if (ratio < 2) return 2;
  if (ratio < 3) return 3;
  if (ratio < 4.5) return 4;
  return 5;
};

export interface FontScore {
  font: BundledFont;
  score: number;
  reasons: string[];
}

/**
 * Picks the bundled face that best matches the Style DNA for the target script.
 *
 * This is the heart of the vector engine's "style transfer": we cannot redraw
 * outlines from a photograph, but we can measure the reference and then choose —
 * and modulate — the closest real typeface, which is exactly how a lettering
 * artist would approach the same brief.
 */
export function scoreFonts(dna: StyleDna, script: ScriptId): FontScore[] {
  const hints = dna.renderHints;
  const corpus = [
    dna.typographyCategory,
    dna.strokeProfile.brushTexture,
    dna.strokeProfile.edgeQuality,
    dna.strokeProfile.strokeContrast,
    dna.formProfile.curves,
    dna.formProfile.terminals,
    dna.formProfile.flourishes,
    dna.formProfile.baseline,
    dna.effectsProfile.glow,
    dna.effectsProfile.paperTexture,
    dna.compositionProfile.layout,
    dna.compositionProfile.decorativeElements,
    dna.generationPrompt,
  ]
    .join(' ')
    .toLowerCase();

  const band = targetContrastBand(hints.strokeContrastRatio);

  return fontsForScript(script)
    .map((font) => {
      const reasons: string[] = [];
      let score = 0;

      if (font.category === hints.fontCategory) {
        score += 42;
        reasons.push(`${font.category} matches the analysed shape family`);
      } else {
        const affinity = AFFINITY[hints.fontCategory]?.[font.category] ?? 0;
        score += affinity;
        if (affinity >= 16) reasons.push(`${font.category} is a close stand-in for ${hints.fontCategory}`);
      }

      const contrastGap = Math.abs(font.contrast - band);
      score -= contrastGap * 7;
      if (contrastGap === 0) reasons.push('stroke contrast band matches exactly');

      if (hints.weight >= font.weightMin && hints.weight <= font.weightMax) {
        score += 16;
        reasons.push(`covers the target weight ${hints.weight}`);
      } else {
        const gap = Math.min(
          Math.abs(hints.weight - font.weightMin),
          Math.abs(hints.weight - font.weightMax),
        );
        score -= Math.min(24, gap / 25);
      }

      const matchedTags = font.tags.filter((tag) => corpus.includes(tag));
      score += Math.min(24, matchedTags.length * 5);
      if (matchedTags.length) reasons.push(`reference mentions ${matchedTags.slice(0, 3).join(', ')}`);

      if (font.caps) {
        if (hints.uppercase) {
          score += 10;
          reasons.push('all-caps face suits the all-caps reference');
        } else {
          score -= 14;
        }
      }
      if (font.variable) score += 5;

      return { font, score, reasons };
    })
    .sort((a, b) => b.score - a.score);
}

export function selectFont(dna: StyleDna, script: ScriptId, preferredId?: string): FontScore {
  const ranked = scoreFonts(dna, script);
  if (preferredId) {
    const preferred = ranked.find((entry) => entry.font.id === preferredId);
    if (preferred) return { ...preferred, reasons: ['chosen by hand in the Fidelity panel'] };
  }
  if (!ranked.length) {
    // Should never happen — every script has bundled coverage — but never crash.
    const fallback = FONT_LIBRARY[0];
    return { font: fallback, score: 0, reasons: ['no face covers this script; falling back'] };
  }
  return ranked[0];
}

/* -------------------------------------------------------------- font loading */

const loaded = new Map<string, Promise<boolean>>();

/**
 * Canvas silently substitutes a fallback face if the webfont has not finished
 * loading, which would quietly ruin the output — so every render awaits this.
 */
export function ensureFontLoaded(font: BundledFont, weight: number): Promise<boolean> {
  const key = `${font.family}:${weight}`;
  const existing = loaded.get(key);
  if (existing) return existing;

  const promise = (async () => {
    if (typeof document === 'undefined' || !document.fonts) return false;
    const spec = `${weight} 64px "${font.family}"`;
    try {
      await Promise.race([
        document.fonts.load(spec),
        new Promise((resolve) => setTimeout(resolve, 8000)),
      ]);
      return document.fonts.check(spec);
    } catch {
      return false;
    }
  })();

  loaded.set(key, promise);
  return promise;
}

/** Preloads the faces most likely to be needed, without blocking first paint. */
export function warmFontCache(scripts: ScriptId[]): void {
  for (const script of scripts) {
    const [first] = fontsForScript(script);
    if (first) void ensureFontLoaded(first, 700);
  }
}

const base64Cache = new Map<string, Promise<string | null>>();

/** Fetches a face as base64 so it can be embedded in exported SVG. */
export function fontAsBase64(font: BundledFont): Promise<string | null> {
  const existing = base64Cache.get(font.id);
  if (existing) return existing;

  const promise = (async () => {
    try {
      const response = await fetch(font.file);
      if (!response.ok) return null;
      const buffer = await response.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = '';
      const chunk = 0x8000;
      for (let index = 0; index < bytes.length; index += chunk) {
        binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
      }
      return btoa(binary);
    } catch {
      return null;
    }
  })();

  base64Cache.set(font.id, promise);
  return promise;
}
