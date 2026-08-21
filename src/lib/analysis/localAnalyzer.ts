import type { DetectedScript } from '@/types/styleDna';
import {
  DEFAULT_RENDER_HINTS,
  normalizeStyleDna,
  type AnalyzedStyle,
  type FontCategory,
  type RenderHints,
  type StyleDna,
  type TypographyCategory,
} from '@/types/styleDna';
import { contrastRatio, describeColor, hexToRgb } from './color';
import { extractFeatures, type ImageFeatures, type ImageLike } from './features';

const round = (value: number, digits = 2): number => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const pct = (value: number): string => `${Math.round(value * 100)}%`;

function inferFontCategory(features: ImageFeatures): FontCategory {
  const { strokeContrastRatio, edgeRoughness, slantDegrees, weightRatio } = features;
  const { roundness } = features.layers;
  const slant = Math.abs(slantDegrees);

  // Order matters: the strongest visual signals are tested first. Roundness is
  // decisive for display lettering, because fat rounded forms and chiselled
  // angular forms can share an identical weight and contrast.
  if (edgeRoughness > 0.5 && strokeContrastRatio > 1.6) return 'brush';
  if (slant >= 10 && strokeContrastRatio >= 2.4) return 'script';
  if (slant >= 10 && edgeRoughness > 0.28) return 'handwriting';

  // Fat, round, low-contrast forms: bubble and marker lettering.
  if (roundness >= 0.55 && weightRatio >= 0.1) return 'rounded';

  // Heavy poster lettering that is not round reads as display.
  if (weightRatio >= 0.16) return 'display';

  // High contrast with an angular boundary is the signature of a serif.
  if (strokeContrastRatio >= 3.2 && roundness < 0.5) return 'serif';
  if (strokeContrastRatio >= 2.4 && roundness < 0.38) return 'serif';

  if (edgeRoughness > 0.42) return 'brush';
  if (roundness >= 0.45 && weightRatio >= 0.09) return 'rounded';
  return 'sans';
}

function inferTypographyCategory(features: ImageFeatures, font: FontCategory): TypographyCategory {
  if (features.glowLevel > 0.45) return 'neon';
  // A layered stack (outline, border, extrusion) is poster lettering by
  // definition, whatever the underlying skeleton looks like.
  const layerCount = features.layers.rings.length + (features.layers.extrusion?.hard ? 1 : 0);
  if (layerCount >= 2) return 'poster';
  if (features.grainLevel > 0.5 && features.strokeContrastRatio > 2) return 'vintage';
  switch (font) {
    case 'serif':
      return 'serif';
    case 'sans':
      return 'sans-serif';
    case 'brush':
      return 'brush';
    case 'script':
      return 'calligraphic';
    case 'handwriting':
      return 'handwritten';
    case 'blackletter':
      return 'gothic';
    case 'display':
      return 'poster';
    default:
      return 'decorative';
  }
}

function weightFromRatio(weightRatio: number): number {
  // Stroke width as a share of line height, mapped onto the usual weight scale.
  const table: Array<[number, number]> = [
    [0.03, 200],
    [0.05, 300],
    [0.07, 400],
    [0.09, 500],
    [0.12, 600],
    [0.15, 700],
    [0.19, 800],
    [0.26, 900],
  ];
  for (const [limit, weight] of table) {
    if (weightRatio <= limit) return weight;
  }
  return 900;
}

function describeStrokeWidth(features: ImageFeatures): string {
  const ratio = features.weightRatio;
  const label =
    ratio < 0.045
      ? 'hairline'
      : ratio < 0.075
        ? 'light'
        : ratio < 0.11
          ? 'medium'
          : ratio < 0.16
            ? 'bold'
            : ratio < 0.22
              ? 'heavy'
              : 'ultra-heavy';
  return `${label} — measured at ${pct(ratio)} of the line height (${round(features.strokeWidthPx, 1)}px in the analysed reference)`;
}

function describeContrast(ratio: number): string {
  if (ratio < 1.25) return `monoline, ${round(ratio)}:1 thick-to-thin`;
  if (ratio < 1.9) return `low contrast, ${round(ratio)}:1 thick-to-thin`;
  if (ratio < 3) return `moderate contrast, ${round(ratio)}:1 thick-to-thin`;
  if (ratio < 4.6) return `high contrast, ${round(ratio)}:1 thick-to-thin`;
  return `extreme didone-like contrast, ${round(ratio)}:1 thick-to-thin`;
}

function describeEdges(roughness: number): string {
  if (roughness < 0.12) return 'crisp, vector-clean edges';
  if (roughness < 0.28) return 'mostly clean with slight organic wobble';
  if (roughness < 0.45) return 'visibly hand-made edges with small nicks and bumps';
  if (roughness < 0.65) return 'rough, dry-brush edges that break up along the stroke';
  return 'heavily distressed, torn and eroded edges';
}

function describeBrush(features: ImageFeatures): string {
  const { edgeRoughness, strokeContrastRatio } = features;
  if (edgeRoughness > 0.5 && strokeContrastRatio > 1.8) return 'flat brush loaded with ink, dry at the tail';
  if (strokeContrastRatio > 3.2) return 'pointed nib with strong pressure modulation';
  if (edgeRoughness > 0.4) return 'marker or dry brush on textured stock';
  if (strokeContrastRatio > 1.8) return 'broad-edge pen held at a consistent angle';
  return 'none — smooth, evenly weighted strokes';
}

function describeSlant(slant: number): string {
  if (Math.abs(slant) < 2) return 'upright, 0°';
  const direction = slant > 0 ? 'to the right' : 'to the left (reverse slant)';
  return `${Math.abs(round(slant, 0))}° ${direction}`;
}

function describeAlignment(features: ImageFeatures): string {
  switch (features.alignment) {
    case 'left':
      return 'flush left, ragged right';
    case 'right':
      return 'flush right';
    default:
      return 'centred on the optical axis';
  }
}

function describeBackground(features: ImageFeatures): string {
  const palette = features.backgroundPalette.map((entry) => describeColor(entry.hex));
  const base = palette.length ? palette.join(' into ') : 'flat field';
  switch (features.backgroundKind) {
    case 'radial':
      return `${base}, brighter at the centre with a soft radial falloff`;
    case 'vignette':
      return `${base} with darkened corners (vignette)`;
    case 'linear':
      return `${base} in a linear sweep across the frame`;
    default:
      return `${base}, evenly lit`;
  }
}

/**
 * Heuristic style extraction that runs entirely in the browser.
 *
 * This is the engine that keeps the studio fully functional with no API key: it
 * measures the reference instead of describing it from memory. Every number in
 * the Style DNA it returns came out of the pixels.
 */
export function analyzeLocally(
  image: ImageLike,
  options: { scriptHint?: DetectedScript | 'auto'; sourceName?: string } = {},
): AnalyzedStyle {
  const started = Date.now();
  const features = extractFeatures(image);
  const fontCategory = inferFontCategory(features);
  const typographyCategory = inferTypographyCategory(features, fontCategory);

  const inkHexes = features.inkPalette.map((entry) => entry.hex);
  const bgHexes = features.backgroundPalette.map((entry) => entry.hex);
  const primary = inkHexes.length ? inkHexes : ['#1d1d1f'];
  const background = bgHexes.length ? bgHexes : ['#f5f5f7'];

  const legibility = contrastRatio(hexToRgb(primary[0]), hexToRgb(background[0]));

  const warnings: string[] = [
    'Measured locally in your browser — colours, stroke geometry and composition are real measurements, but letter shapes are matched to the closest bundled typeface rather than redrawn.',
  ];

  let detectedScript: DetectedScript = 'Unknown';
  if (options.scriptHint && options.scriptHint !== 'auto') {
    detectedScript = options.scriptHint;
  } else if (features.headlineScore > 0.35) {
    warnings.push(
      `A strong horizontal headline was detected (${pct(features.headlineScore)} confidence), which points to Bengali or Devanagari. Pick the reference script by hand to lock it in.`,
    );
  } else {
    warnings.push(
      'Reading the reference text needs the Gemini analyst — add an API key, or set the reference script manually.',
    );
  }

  if (legibility < 2.4) {
    warnings.push(
      `Reference lettering sits at only ${round(legibility, 1)}:1 against its background. Raise “Text readability” if your poster needs to work at a distance.`,
    );
  }
  if (features.hasAlpha) {
    warnings.push('The reference has transparent pixels; it was analysed as if composited on white.');
  }

  const shadowHex = features.shadow?.hex ?? 'none';
  const hints: RenderHints = {
    ...DEFAULT_RENDER_HINTS,
    fontCategory,
    weight: weightFromRatio(features.weightRatio),
    slantDegrees: round(features.slantDegrees, 1),
    letterSpacingEm: features.inkCoverage < 0.06 ? 0.06 : 0,
    lineHeight: features.lineBoxes.length > 1 ? 1.14 : 1.05,
    strokeContrastRatio: round(features.strokeContrastRatio),
    penAngleDegrees: features.strokeContrastRatio > 1.6 ? 30 : 0,
    outlineWidthEm: features.layers.rings[0]
      ? round(features.layers.rings[0].widthPx / Math.max(1, features.layers.strokeWidthPx) * 0.5, 3)
      : 0,
    borderWidthEm: features.layers.rings[1]
      ? round(features.layers.rings[1].widthPx / Math.max(1, features.layers.strokeWidthPx) * 0.5, 3)
      : 0,
    extrusionOffsetEm: features.layers.extrusion?.hard
      ? round(
          Math.hypot(features.layers.extrusion.dx, features.layers.extrusion.dy) /
            Math.max(1, features.layers.strokeWidthPx) *
            0.5,
          3,
        )
      : 0,
    extrusionAngleDegrees: features.layers.extrusion
      ? round((Math.atan2(features.layers.extrusion.dy, features.layers.extrusion.dx) * 180) / Math.PI, 0)
      : 45,
    roundness: round(features.layers.roundness, 2),
    shadowOffsetEm: features.shadow ? round(Math.hypot(features.shadow.dx, features.shadow.dy) * 0.02, 3) : 0,
    shadowBlurEm: features.shadow ? round(features.shadow.strength * 0.08, 3) : 0,
    shadowAngleDegrees: features.shadow
      ? round((Math.atan2(features.shadow.dy, features.shadow.dx) * 180) / Math.PI, 0)
      : 45,
    glowRadiusEm: round(features.glowLevel * 0.35, 3),
    embossStrength: 0,
    textureIntensity: round(features.grainLevel, 2),
    inkBleedAmount: round(Math.min(1, features.edgeRoughness * 0.7), 2),
    edgeRoughness: round(features.edgeRoughness, 2),
    uppercase: false,
    gradientAngleDegrees: round(features.layers.bodyGradientAngle, 0),
    gradientKind: features.layers.bodyGradient > 0.2 ? 'linear' : 'none',
    backgroundKind: features.backgroundKind,
    alignment: features.alignment,
    marginRatio: round(features.marginRatio, 3),
    hierarchyContrast: features.hierarchyLevels > 1 ? 0.55 : 0.82,
    ornamentation: 0,
    baselineJitterEm: features.edgeRoughness > 0.35 ? 0.02 : 0,
  };

  const dna: StyleDna = normalizeStyleDna({
    detectedScript,
    detectedReferenceText: '',
    typographyCategory,
    strokeProfile: {
      averageStrokeWidth: describeStrokeWidth(features),
      strokeContrast: describeContrast(features.strokeContrastRatio),
      pressureVariation:
        features.strokeContrastRatio > 2
          ? 'clear pressure swell through the middle of each stroke, thinning at entry and exit'
          : 'even pressure from entry to exit',
      edgeQuality: describeEdges(features.edgeRoughness),
      brushTexture: describeBrush(features),
    },
    formProfile: {
      xHeightOrScriptScale: `lettering fills ${pct(
        (features.bbox.y1 - features.bbox.y0) / Math.max(1, features.height),
      )} of the frame height across ${features.lineBoxes.length} line${features.lineBoxes.length === 1 ? '' : 's'}`,
      curves:
        features.edgeRoughness > 0.4
          ? 'organic, hand-drawn curves with uneven tension'
          : 'controlled curves with even tension',
      terminals:
        features.strokeContrastRatio > 3
          ? 'finely tapered terminals'
          : features.edgeRoughness > 0.4
            ? 'frayed, brush-swept terminals'
            : 'blunt, squared terminals',
      ligatures: 'standard ligatures and conjuncts as the script requires',
      flourishes: 'none detected by the local analyser',
      slant: describeSlant(features.slantDegrees),
      baseline:
        features.edgeRoughness > 0.35
          ? 'slightly bouncing baseline, hand-set feel'
          : 'rigid, level baseline',
    },
    colorProfile: {
      // The body colour comes from the deep core of the strokes, so a thick
      // border can no longer masquerade as the lettering colour.
      primaryColors: [features.layers.bodyHex, ...features.layers.accentHexes].slice(0, 3),
      secondaryColors: inkHexes.slice(1),
      gradientDescription:
        features.inkGradient.strength > 0.18
          ? `linear gradient across the lettering at ${round(features.inkGradient.angleDegrees, 0)}°, ${pct(
              features.inkGradient.strength,
            )} strength`
          : 'none — flat colour',
      shadowColor: features.layers.extrusion && !features.layers.extrusion.hard
        ? features.layers.extrusion.hex
        : shadowHex,
      outlineColor: features.layers.rings[0]?.hex ?? 'none',
      borderColor: features.layers.rings[1]?.hex ?? 'none',
      extrusionColor: features.layers.extrusion?.hard ? features.layers.extrusion.hex : 'none',
      backgroundColors: background,
    },
    effectsProfile: {
      shadow: features.shadow
        ? `offset ${round(features.shadow.dx, 1)}× / ${round(features.shadow.dy, 1)}× the stroke width, ${pct(
            features.shadow.strength,
          )} coverage, sampled as ${describeColor(features.shadow.hex)}`
        : 'none',
      outline: features.layers.rings[0]
        ? `${describeColor(features.layers.rings[0].hex)} outline about ${Math.round(features.layers.rings[0].widthPx)}px thick`
        : 'none',
      border: features.layers.rings[1]
        ? `${describeColor(features.layers.rings[1].hex)} outer keyline about ${Math.round(features.layers.rings[1].widthPx)}px thick`
        : 'none',
      extrusion: features.layers.extrusion?.hard
        ? `hard ${describeColor(features.layers.extrusion.hex)} extrusion offset ${features.layers.extrusion.dx}/${features.layers.extrusion.dy}px`
        : 'none',
      glow: features.glowLevel > 0.2 ? `soft bloom around the strokes, ${pct(features.glowLevel)} intensity` : 'none',
      emboss: 'none',
      inkBleed:
        features.edgeRoughness > 0.3
          ? `ink spreads into the substrate, ${pct(features.edgeRoughness)} edge break-up`
          : 'none',
      paperTexture: features.grainLevel > 0.25 ? `textured substrate, ${pct(features.grainLevel)} tooth` : 'none',
      grain: features.grainLevel > 0.12 ? `${pct(features.grainLevel)} high-frequency grain` : 'none',
      lighting:
        features.backgroundKind === 'radial'
          ? 'light pooling behind the lettering'
          : features.backgroundKind === 'vignette'
            ? 'darkened corners, spotlight on the type'
            : 'flat, even lighting',
    },
    compositionProfile: {
      layout: `${features.lineBoxes.length === 1 ? 'single line' : `${features.lineBoxes.length} stacked lines`} of lettering occupying ${pct(
        ((features.bbox.x1 - features.bbox.x0) * (features.bbox.y1 - features.bbox.y0)) /
          Math.max(1, 480 * 480 * (features.aspect > 1 ? 1 / features.aspect : features.aspect)),
      )} of the frame, ${describeBackground(features)}`,
      alignment: describeAlignment(features),
      margins: `about ${pct(features.marginRatio)} of the width on the short side`,
      textHierarchy:
        features.hierarchyLevels > 1
          ? `${features.hierarchyLevels} distinct type sizes`
          : 'one dominant level',
      decorativeElements: 'none detected by the local analyser',
    },
    renderHints: hints,
    generationPrompt: buildLocalGenerationPrompt(features, fontCategory, primary, background),
    negativePrompt:
      'misspelled or altered text, extra words, watermarks, signature, blurry or broken glyphs, incorrect conjuncts, lorem ipsum, photographic clutter behind the lettering',
    confidenceScore: round(
      0.42 +
        Math.min(0.16, features.inkCoverage * 1.2) +
        (features.lineBoxes.length ? 0.04 : 0) +
        (features.headlineScore > 0.35 ? 0.04 : 0),
      2,
    ),
    userWarnings: warnings,
  });

  return {
    dna,
    meta: {
      engine: 'local-heuristic',
      elapsedMs: Date.now() - started,
      sourceName: options.sourceName,
    },
  };
}

function buildLocalGenerationPrompt(
  features: ImageFeatures,
  fontCategory: FontCategory,
  primary: string[],
  background: string[],
): string {
  return [
    `Hand-letter the supplied text as ${fontCategory} display typography.`,
    `Strokes: ${describeStrokeWidth(features)}; ${describeContrast(features.strokeContrastRatio)}; ${describeEdges(
      features.edgeRoughness,
    )}; tool reads as ${describeBrush(features)}.`,
    `Slant ${describeSlant(features.slantDegrees)}, ${describeAlignment(features)}.`,
    `Lettering colours ${primary.map(describeColor).join(', ')} (${primary.join(', ')}) on ${describeBackground(
      features,
    )} (${background.join(', ')}).`,
    features.shadow ? 'Keep the offset drop shadow beneath the letters.' : 'No drop shadow.',
    features.glowLevel > 0.2 ? 'Add the soft bloom seen around the reference strokes.' : 'No glow.',
    features.grainLevel > 0.25 ? 'Preserve the tactile paper grain.' : 'Keep the surface clean.',
  ].join(' ');
}

/* ------------------------------------------------------- browser-only helpers */

/** Decodes a file into pixels for the analyser, downscaling very large uploads. */
export async function imageDataFromBlob(blob: Blob, maxEdge = 1024): Promise<ImageData> {
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Canvas 2D is unavailable in this browser.');
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return context.getImageData(0, 0, width, height);
}

export async function measureImage(blob: Blob): Promise<{ width: number; height: number }> {
  const bitmap = await createImageBitmap(blob);
  const size = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return size;
}
