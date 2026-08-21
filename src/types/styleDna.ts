/**
 * The Style DNA is the contract between every part of the studio:
 * the Gemini analyst writes it, the local heuristic analyser writes it,
 * the prompt builder reads it, the vector engine renders from it and the
 * Style Analysis panel visualises it.
 */

export type DetectedScript = 'Latin' | 'Bengali' | 'Devanagari' | 'Mixed' | 'Unknown';

export type TypographyCategory =
  | 'serif'
  | 'sans-serif'
  | 'brush'
  | 'gothic'
  | 'handwritten'
  | 'calligraphic'
  | 'decorative'
  | 'poster'
  | 'neon'
  | 'vintage'
  | 'unknown';

export type FontCategory =
  | 'serif'
  | 'sans'
  | 'slab'
  | 'display'
  | 'script'
  | 'brush'
  | 'blackletter'
  | 'monospace'
  | 'rounded'
  | 'handwriting';

export interface StrokeProfile {
  averageStrokeWidth: string;
  strokeContrast: string;
  pressureVariation: string;
  edgeQuality: string;
  brushTexture: string;
}

export interface FormProfile {
  xHeightOrScriptScale: string;
  curves: string;
  terminals: string;
  ligatures: string;
  flourishes: string;
  slant: string;
  baseline: string;
}

export interface ColorProfile {
  primaryColors: string[];
  secondaryColors: string[];
  gradientDescription: string;
  shadowColor: string;
  outlineColor: string;
  /** Outer ring beyond the outline — the white keyline poster lettering uses. */
  borderColor: string;
  /** Flat colour of a hard drop-extrusion, if the lettering has one. */
  extrusionColor: string;
  backgroundColors: string[];
}

export interface EffectsProfile {
  shadow: string;
  outline: string;
  /** Outer keyline beyond the outline. */
  border: string;
  /** Hard offset copy behind the letters (poster extrusion, not a soft shadow). */
  extrusion: string;
  glow: string;
  emboss: string;
  inkBleed: string;
  paperTexture: string;
  grain: string;
  lighting: string;
}

export interface CompositionProfile {
  layout: string;
  alignment: string;
  margins: string;
  textHierarchy: string;
  decorativeElements: string;
}

/**
 * Numeric distillation of the profiles above. Everything the deterministic
 * vector engine needs lives here, so the renderer never has to parse prose.
 */
export interface RenderHints {
  fontCategory: FontCategory;
  /** Target weight on the 100–900 scale. */
  weight: number;
  /** Negative leans left, positive leans right. */
  slantDegrees: number;
  letterSpacingEm: number;
  lineHeight: number;
  /** 1 = monoline, 8 = extreme thick/thin modulation. */
  strokeContrastRatio: number;
  /** Broad-nib pen angle in degrees, used for calligraphic modulation. */
  penAngleDegrees: number;
  outlineWidthEm: number;
  /** Outer keyline drawn beyond the outline, in em. */
  borderWidthEm: number;
  /** Hard offset copy behind the letters, in em (0 = none). */
  extrusionOffsetEm: number;
  extrusionAngleDegrees: number;
  /**
   * 0 = angular or hairline letterforms, 1 = fat rounded "bubble" forms.
   * Drives typeface selection more strongly than any prose description.
   */
  roundness: number;
  shadowOffsetEm: number;
  shadowBlurEm: number;
  /** Direction the shadow falls, 0° = to the right, 45° = down-right. */
  shadowAngleDegrees: number;
  glowRadiusEm: number;
  embossStrength: number;
  textureIntensity: number;
  inkBleedAmount: number;
  edgeRoughness: number;
  uppercase: boolean;
  gradientAngleDegrees: number;
  /** 'none' | 'linear' | 'radial' for the lettering fill. */
  gradientKind: 'none' | 'linear' | 'radial';
  backgroundKind: 'flat' | 'linear' | 'radial' | 'vignette';
  alignment: 'left' | 'center' | 'right';
  marginRatio: number;
  /** Size multiplier applied to secondary lines (visual hierarchy). */
  hierarchyContrast: number;
  ornamentation: number;
  /** Vertical wobble of the baseline, in em. */
  baselineJitterEm: number;
}

export interface StyleDna {
  detectedScript: DetectedScript;
  detectedReferenceText: string;
  typographyCategory: TypographyCategory;
  strokeProfile: StrokeProfile;
  formProfile: FormProfile;
  colorProfile: ColorProfile;
  effectsProfile: EffectsProfile;
  compositionProfile: CompositionProfile;
  renderHints: RenderHints;
  generationPrompt: string;
  negativePrompt: string;
  confidenceScore: number;
  userWarnings: string[];
}

export interface StyleDnaMeta {
  engine: 'gemini' | 'local-heuristic' | 'preset';
  model?: string | null;
  elapsedMs?: number;
  /** Present when Gemini analysis failed and the local engine took over. */
  fallbackReason?: string;
  sourceName?: string;
}

export interface AnalyzedStyle {
  dna: StyleDna;
  meta: StyleDnaMeta;
}

/* ------------------------------------------------------------------ helpers */

export const DEFAULT_RENDER_HINTS: RenderHints = {
  fontCategory: 'sans',
  weight: 700,
  slantDegrees: 0,
  letterSpacingEm: 0,
  lineHeight: 1.12,
  strokeContrastRatio: 1,
  penAngleDegrees: 30,
  outlineWidthEm: 0,
  borderWidthEm: 0,
  extrusionOffsetEm: 0,
  extrusionAngleDegrees: 45,
  roundness: 0.4,
  shadowOffsetEm: 0,
  shadowBlurEm: 0,
  shadowAngleDegrees: 45,
  glowRadiusEm: 0,
  embossStrength: 0,
  textureIntensity: 0,
  inkBleedAmount: 0,
  edgeRoughness: 0,
  uppercase: false,
  gradientAngleDegrees: 90,
  gradientKind: 'none',
  backgroundKind: 'flat',
  alignment: 'center',
  marginRatio: 0.1,
  hierarchyContrast: 1,
  ornamentation: 0,
  baselineJitterEm: 0,
};

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/** Accepts what a model might return and produces a usable CSS hex colour. */
export function normalizeHex(input: unknown, fallback: string): string {
  if (typeof input !== 'string') return fallback;
  const trimmed = input.trim();
  if (!trimmed || /^(none|transparent|n\/?a|null)$/i.test(trimmed)) return fallback;
  const match = trimmed.match(HEX);
  if (match) {
    const body = match[1];
    if (body.length === 3) {
      return `#${body[0]}${body[0]}${body[1]}${body[1]}${body[2]}${body[2]}`.toLowerCase();
    }
    return `#${body}`.toLowerCase();
  }
  // Named colours the model may emit, plus the ones that matter for lettering.
  const named: Record<string, string> = {
    black: '#000000',
    white: '#ffffff',
    red: '#ff3b30',
    crimson: '#b3122b',
    maroon: '#6d1120',
    gold: '#d4a339',
    golden: '#d4a339',
    yellow: '#ffcc00',
    orange: '#ff9f0a',
    green: '#34c759',
    teal: '#0f8b8d',
    blue: '#0071e3',
    navy: '#10233f',
    indigo: '#3d2b8c',
    purple: '#7d3cc0',
    magenta: '#d63aa5',
    pink: '#ff6f91',
    brown: '#6b4a2f',
    cream: '#f3ead6',
    beige: '#e8dcc4',
    ivory: '#fbf7ee',
    silver: '#c7c7cc',
    gray: '#8e8e93',
    grey: '#8e8e93',
    charcoal: '#2b2b30',
    graphite: '#1c1c1e',
  };
  const key = trimmed.toLowerCase().replace(/\s+/g, '');
  if (named[key]) return named[key];
  for (const [name, hex] of Object.entries(named)) {
    if (key.includes(name)) return hex;
  }
  return fallback;
}

/**
 * Recognises "no effect" in the many ways an analyst (or a model) writes it.
 * Descriptions routinely read "none — flat colour" or "no shadow", so matching
 * only the bare word would silently switch effects on.
 */
const isNoneish = (value: unknown): boolean => {
  if (typeof value !== 'string') return true;
  const trimmed = value.trim();
  if (!trimmed) return true;
  return /^(none|no|n\/?a|null|nil|absent|not present|not detected|nothing|flat)\b/i.test(trimmed);
};

export function hasEffect(value: string | undefined): boolean {
  return !isNoneish(value);
}

const str = (value: unknown, fallback: string): string => {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : fallback;
};

const strList = (value: unknown, fallback: string[]): string[] => {
  if (!Array.isArray(value)) return [...fallback];
  const out = value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
  return out.length ? out : [...fallback];
};

export const clamp = (value: number, min: number, max: number): number =>
  Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;

const num = (value: unknown, fallback: number, min: number, max: number): number => {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''));
  if (!Number.isFinite(parsed)) return fallback;
  return clamp(parsed, min, max);
};

const ENUM_SCRIPTS: DetectedScript[] = ['Latin', 'Bengali', 'Devanagari', 'Mixed', 'Unknown'];
const ENUM_CATEGORIES: TypographyCategory[] = [
  'serif',
  'sans-serif',
  'brush',
  'gothic',
  'handwritten',
  'calligraphic',
  'decorative',
  'poster',
  'neon',
  'vintage',
  'unknown',
];
const ENUM_FONT_CATEGORIES: FontCategory[] = [
  'serif',
  'sans',
  'slab',
  'display',
  'script',
  'brush',
  'blackletter',
  'monospace',
  'rounded',
  'handwriting',
];

function pickEnum<T extends string>(value: unknown, allowed: T[], fallback: T): T {
  if (typeof value !== 'string') return fallback;
  const lower = value.trim().toLowerCase();
  const exact = allowed.find((item) => item.toLowerCase() === lower);
  if (exact) return exact;
  const partial = allowed.find((item) => lower.includes(item.toLowerCase()));
  return partial ?? fallback;
}

/** Reads a degree value out of prose like "about 12° to the right". */
export function parseDegrees(text: string | undefined, fallback = 0): number {
  if (!text) return fallback;
  const match = text.match(/(-?\d+(?:\.\d+)?)\s*(?:°|deg)/i) ?? text.match(/(-?\d+(?:\.\d+)?)/);
  if (!match) return /left|back(?:ward)?|reverse/i.test(text) ? -8 : fallback;
  let value = Number.parseFloat(match[1]);
  if (!Number.isFinite(value)) return fallback;
  if (/left|back(?:ward)?|counter|reverse/i.test(text) && value > 0) value = -value;
  if (/upright|vertical|no slant|none/i.test(text)) value = 0;
  return clamp(value, -45, 45);
}

/** Reads a ratio out of prose like "4:1 thick to thin" or "high contrast". */
export function parseContrast(text: string | undefined, fallback = 1): number {
  if (!text) return fallback;
  const ratio = text.match(/(\d+(?:\.\d+)?)\s*[:x/]\s*(\d+(?:\.\d+)?)/);
  if (ratio) {
    const a = Number.parseFloat(ratio[1]);
    const b = Number.parseFloat(ratio[2]);
    if (Number.isFinite(a) && Number.isFinite(b) && b > 0) return clamp(a / b, 1, 8);
  }
  if (/extreme|dramatic|didone|very high/i.test(text)) return 6;
  if (/high/i.test(text)) return 4;
  if (/moderate|medium/i.test(text)) return 2.2;
  if (/low|slight|subtle/i.test(text)) return 1.4;
  if (/monoline|uniform|even|none|no contrast/i.test(text)) return 1;
  return fallback;
}

/** Coerces anything (Gemini JSON, preset, cached blob) into a valid StyleDna. */
export function normalizeStyleDna(input: unknown): StyleDna {
  const raw = (input ?? {}) as Record<string, any>;
  const stroke = (raw.strokeProfile ?? {}) as Record<string, unknown>;
  const form = (raw.formProfile ?? {}) as Record<string, unknown>;
  const color = (raw.colorProfile ?? {}) as Record<string, unknown>;
  const effects = (raw.effectsProfile ?? {}) as Record<string, unknown>;
  const composition = (raw.compositionProfile ?? {}) as Record<string, unknown>;
  const hints = (raw.renderHints ?? {}) as Record<string, unknown>;

  const strokeProfile: StrokeProfile = {
    averageStrokeWidth: str(stroke.averageStrokeWidth, 'medium, roughly 8% of cap height'),
    strokeContrast: str(stroke.strokeContrast, 'low contrast, close to monoline'),
    pressureVariation: str(stroke.pressureVariation, 'even pressure throughout'),
    edgeQuality: str(stroke.edgeQuality, 'clean, crisp edges'),
    brushTexture: str(stroke.brushTexture, 'none — smooth digital strokes'),
  };

  const formProfile: FormProfile = {
    xHeightOrScriptScale: str(form.xHeightOrScriptScale, 'normal proportions'),
    curves: str(form.curves, 'balanced, slightly humanist curves'),
    terminals: str(form.terminals, 'blunt terminals'),
    ligatures: str(form.ligatures, 'standard ligatures only'),
    flourishes: str(form.flourishes, 'none'),
    slant: str(form.slant, 'upright, 0°'),
    baseline: str(form.baseline, 'rigid, level baseline'),
  };

  const colorProfile: ColorProfile = {
    primaryColors: strList(color.primaryColors, ['#1d1d1f']).map((c) => normalizeHex(c, '#1d1d1f')),
    secondaryColors: strList(color.secondaryColors, []).map((c) => normalizeHex(c, '#6e6e73')),
    gradientDescription: str(color.gradientDescription, 'none — flat colour'),
    shadowColor: isNoneish(color.shadowColor) ? 'none' : normalizeHex(color.shadowColor, '#00000040'),
    outlineColor: isNoneish(color.outlineColor) ? 'none' : normalizeHex(color.outlineColor, '#000000'),
    borderColor: isNoneish(color.borderColor) ? 'none' : normalizeHex(color.borderColor, '#ffffff'),
    extrusionColor: isNoneish(color.extrusionColor) ? 'none' : normalizeHex(color.extrusionColor, '#000000'),
    backgroundColors: strList(color.backgroundColors, ['#f5f5f7']).map((c) => normalizeHex(c, '#f5f5f7')),
  };

  const effectsProfile: EffectsProfile = {
    shadow: str(effects.shadow, 'none'),
    outline: str(effects.outline, 'none'),
    border: str(effects.border, 'none'),
    extrusion: str(effects.extrusion, 'none'),
    glow: str(effects.glow, 'none'),
    emboss: str(effects.emboss, 'none'),
    inkBleed: str(effects.inkBleed, 'none'),
    paperTexture: str(effects.paperTexture, 'none'),
    grain: str(effects.grain, 'none'),
    lighting: str(effects.lighting, 'flat, even lighting'),
  };

  const compositionProfile: CompositionProfile = {
    layout: str(composition.layout, 'single centred block of lettering'),
    alignment: str(composition.alignment, 'centred'),
    margins: str(composition.margins, 'even margins, about 10% of the width'),
    textHierarchy: str(composition.textHierarchy, 'one dominant level'),
    decorativeElements: str(composition.decorativeElements, 'none'),
  };

  const alignmentWord = compositionProfile.alignment.toLowerCase();
  const alignmentFromProse: RenderHints['alignment'] = /right/.test(alignmentWord)
    ? 'right'
    : /left|flush left|ragged right/.test(alignmentWord)
      ? 'left'
      : 'center';
  // An explicit hint always beats the prose it was derived from.
  const alignment = pickEnum<RenderHints['alignment']>(
    hints.alignment,
    ['left', 'center', 'right'],
    alignmentFromProse,
  );

  const gradientText = colorProfile.gradientDescription.toLowerCase();
  const gradientFromProse: RenderHints['gradientKind'] = isNoneish(gradientText)
    ? 'none'
    : /radial|centre-out|center-out|burst|spot/.test(gradientText)
      ? 'radial'
      : 'linear';
  const gradientKind = pickEnum<RenderHints['gradientKind']>(
    hints.gradientKind,
    ['none', 'linear', 'radial'],
    gradientFromProse,
  );

  const bgText = `${effectsProfile.lighting} ${compositionProfile.layout} ${colorProfile.backgroundColors.join(' ')}`;
  const backgroundFromProse: RenderHints['backgroundKind'] =
    colorProfile.backgroundColors.length > 1
      ? /radial|glow|spot|vignette/i.test(bgText)
        ? 'radial'
        : 'linear'
      : /vignette|darkened edges/i.test(bgText)
        ? 'vignette'
        : 'flat';
  const backgroundKind = pickEnum<RenderHints['backgroundKind']>(
    hints.backgroundKind,
    ['flat', 'linear', 'radial', 'vignette'],
    backgroundFromProse,
  );

  const contrastRatio = num(
    hints.strokeContrastRatio,
    parseContrast(strokeProfile.strokeContrast, 1),
    1,
    8,
  );

  const renderHints: RenderHints = {
    fontCategory: pickEnum(
      hints.fontCategory,
      ENUM_FONT_CATEGORIES,
      fontCategoryFromTypography(pickEnum(raw.typographyCategory, ENUM_CATEGORIES, 'unknown')),
    ),
    weight: Math.round(num(hints.weight, weightFromProse(strokeProfile.averageStrokeWidth), 100, 900)),
    slantDegrees: num(hints.slantDegrees, parseDegrees(formProfile.slant, 0), -45, 45),
    letterSpacingEm: num(hints.letterSpacingEm, 0, -0.12, 0.8),
    lineHeight: num(hints.lineHeight, 1.12, 0.75, 2.4),
    strokeContrastRatio: contrastRatio,
    penAngleDegrees: num(hints.penAngleDegrees, contrastRatio > 1.6 ? 32 : 0, -90, 90),
    outlineWidthEm: num(
      hints.outlineWidthEm,
      hasEffect(effectsProfile.outline) ? 0.03 : 0,
      0,
      0.3,
    ),
    borderWidthEm: num(hints.borderWidthEm, colorProfile.borderColor === 'none' ? 0 : 0.05, 0, 0.4),
    extrusionOffsetEm: num(
      hints.extrusionOffsetEm,
      colorProfile.extrusionColor === 'none' ? 0 : 0.06,
      0,
      0.5,
    ),
    extrusionAngleDegrees: num(hints.extrusionAngleDegrees, 45, -180, 180),
    roundness: num(hints.roundness, 0.4, 0, 1),
    shadowOffsetEm: num(hints.shadowOffsetEm, hasEffect(effectsProfile.shadow) ? 0.045 : 0, 0, 0.5),
    shadowBlurEm: num(hints.shadowBlurEm, hasEffect(effectsProfile.shadow) ? 0.06 : 0, 0, 0.8),
    shadowAngleDegrees: num(hints.shadowAngleDegrees, 45, -180, 180),
    glowRadiusEm: num(hints.glowRadiusEm, hasEffect(effectsProfile.glow) ? 0.22 : 0, 0, 1),
    embossStrength: num(hints.embossStrength, hasEffect(effectsProfile.emboss) ? 0.5 : 0, 0, 1),
    textureIntensity: num(
      hints.textureIntensity,
      hasEffect(effectsProfile.paperTexture) || hasEffect(effectsProfile.grain) ? 0.35 : 0,
      0,
      1,
    ),
    inkBleedAmount: num(hints.inkBleedAmount, hasEffect(effectsProfile.inkBleed) ? 0.35 : 0, 0, 1),
    edgeRoughness: num(
      hints.edgeRoughness,
      /rough|torn|dry|ragged|grit|distress/i.test(strokeProfile.edgeQuality) ? 0.4 : 0,
      0,
      1,
    ),
    uppercase:
      typeof hints.uppercase === 'boolean'
        ? hints.uppercase
        : isAllCaps(str(raw.detectedReferenceText, '')),
    gradientAngleDegrees: num(hints.gradientAngleDegrees, 90, -180, 180),
    gradientKind,
    backgroundKind,
    alignment,
    marginRatio: num(hints.marginRatio, parseMargin(compositionProfile.margins), 0.02, 0.3),
    hierarchyContrast: num(
      hints.hierarchyContrast,
      /two|three|multiple|several|secondary/i.test(compositionProfile.textHierarchy) ? 0.55 : 0.8,
      0.3,
      1,
    ),
    ornamentation: num(
      hints.ornamentation,
      hasEffect(formProfile.flourishes) || hasEffect(compositionProfile.decorativeElements) ? 0.45 : 0,
      0,
      1,
    ),
    baselineJitterEm: num(
      hints.baselineJitterEm,
      /bounc|wavy|irregular|uneven|hand/i.test(formProfile.baseline) ? 0.03 : 0,
      0,
      0.2,
    ),
  };

  return {
    detectedScript: pickEnum(raw.detectedScript, ENUM_SCRIPTS, 'Unknown'),
    detectedReferenceText: str(raw.detectedReferenceText, ''),
    typographyCategory: pickEnum(raw.typographyCategory, ENUM_CATEGORIES, 'unknown'),
    strokeProfile,
    formProfile,
    colorProfile,
    effectsProfile,
    compositionProfile,
    renderHints,
    generationPrompt: str(raw.generationPrompt, ''),
    negativePrompt: str(
      raw.negativePrompt,
      'misspelled text, altered wording, extra words, watermarks, blurry glyphs, broken conjuncts',
    ),
    confidenceScore: num(raw.confidenceScore, 0.5, 0, 1),
    userWarnings: strList(raw.userWarnings, []),
  };
}

function isAllCaps(text: string): boolean {
  const letters = text.replace(/[^A-Za-z]/g, '');
  if (letters.length < 3) return false;
  return letters === letters.toUpperCase();
}

function weightFromProse(text: string): number {
  const lower = text.toLowerCase();
  if (/hairline|thin|very light/.test(lower)) return 200;
  if (/light|delicate|fine/.test(lower)) return 300;
  if (/heavy|black|ultra|fat|very (?:bold|thick)/.test(lower)) return 900;
  if (/bold|thick|chunky/.test(lower)) return 750;
  if (/medium|moderate/.test(lower)) return 550;
  const percent = lower.match(/(\d+(?:\.\d+)?)\s*%/);
  if (percent) {
    const value = Number.parseFloat(percent[1]);
    if (Number.isFinite(value)) return Math.round(clamp(200 + value * 45, 100, 900));
  }
  return 700;
}

function parseMargin(text: string): number {
  const percent = text.match(/(\d+(?:\.\d+)?)\s*%/);
  if (percent) {
    const value = Number.parseFloat(percent[1]);
    if (Number.isFinite(value)) return clamp(value / 100, 0.02, 0.3);
  }
  if (/tight|edge-to-edge|bleed|minimal|narrow/i.test(text)) return 0.05;
  if (/generous|wide|airy|spacious/i.test(text)) return 0.16;
  return 0.1;
}

export function fontCategoryFromTypography(category: TypographyCategory): FontCategory {
  switch (category) {
    case 'serif':
    case 'vintage':
      return 'serif';
    case 'sans-serif':
      return 'sans';
    case 'brush':
      return 'brush';
    case 'gothic':
      return 'blackletter';
    case 'handwritten':
      return 'handwriting';
    case 'calligraphic':
      return 'script';
    case 'decorative':
    case 'poster':
    case 'neon':
      return 'display';
    default:
      return 'sans';
  }
}
