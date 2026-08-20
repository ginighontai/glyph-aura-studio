import {
  generationMode,
  type FidelityControls,
  type GenerationModeId,
  type ScriptId,
} from '@/types/project';
import { clamp, type StyleDna } from '@/types/styleDna';
import { contrastRatio, darken, hexToRgb, lighten, luminance, mixRgb, toHex } from '../analysis/color';
import { selectFont, type BundledFont } from './fonts';

export interface ColorStop {
  offset: number;
  color: string;
}

export interface GradientSpec {
  kind: 'linear' | 'radial';
  angleDegrees: number;
  stops: ColorStop[];
}

export interface BackgroundSpec {
  kind: 'flat' | 'linear' | 'radial' | 'vignette';
  colors: string[];
  angleDegrees: number;
}

export interface EffectiveStyle {
  font: BundledFont;
  fontReasons: string[];
  fontScore: number;
  weight: number;
  slantDegrees: number;
  letterSpacingEm: number;
  lineHeight: number;
  alignment: 'left' | 'center' | 'right';
  marginRatio: number;
  uppercase: boolean;
  hierarchyContrast: number;
  opticalScale: number;
  /** Broad-nib simulation: extra width laid down perpendicular to the pen angle. */
  nibWidthEm: number;
  penAngleDegrees: number;
  inkColors: string[];
  gradient: GradientSpec | null;
  outline: { widthEm: number; color: string } | null;
  shadow: { offsetEm: number; blurEm: number; angleDegrees: number; color: string } | null;
  glow: { radiusEm: number; color: string } | null;
  embossStrength: number;
  background: BackgroundSpec | null;
  paperTexture: number;
  grain: number;
  inkBleed: number;
  edgeRoughness: number;
  ornamentation: number;
  baselineJitterEm: number;
  transparent: boolean;
  vectorFriendly: boolean;
  /** Effective thick/thin target after the sliders had their say. */
  strokeContrastRatio: number;
}

export interface ResolveInput {
  dna: StyleDna;
  script: ScriptId;
  fidelity: FidelityControls;
  mode: GenerationModeId;
  transparent: boolean;
  preferredFontId?: string;
  /** Export-time overrides. */
  typographyOnly?: boolean;
  preserveEffects?: boolean;
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const unit = (value: number): number => clamp(value / 100, 0, 1);

const blendHex = (from: string, to: string, amount: number): string =>
  toHex(mixRgb(hexToRgb(from), hexToRgb(to), clamp(amount, 0, 1)));

const isLight = (hex: string): boolean => luminance(hexToRgb(hex)) > 140;

/**
 * Turns the Style DNA plus the designer's six sliders, the generation mode and
 * the transparency choice into one flat set of numbers both renderers consume.
 *
 * Kept pure on purpose: it is the piece most worth unit-testing, because every
 * visible control in the studio ends up here.
 */
export function resolveEffectiveStyle(input: ResolveInput): EffectiveStyle {
  const { dna, script, fidelity, transparent } = input;
  const hints = dna.renderHints;
  const mode = generationMode(input.mode);
  const bias = mode.bias;

  const strength = clamp(unit(fidelity.styleStrength) * (bias.styleStrength ?? 1), 0, 1);
  const readability = clamp(unit(fidelity.textReadability) * (bias.readability ?? 1), 0, 1);
  const colorMatch = unit(fidelity.colorMatching);
  const ornamentSlider = clamp(unit(fidelity.ornamentation) * (bias.ornamentation ?? 1), 0, 1);
  const textureSlider = clamp(unit(fidelity.textureIntensity) * (bias.texture ?? 1), 0, 1);
  const roughSlider = clamp(unit(fidelity.brushRoughness) * (bias.roughness ?? 1), 0, 1);

  const flat = bias.forceFlat === true;
  const isTransparent = transparent || bias.forceTransparent === true || input.typographyOnly === true;
  const keepEffects = input.preserveEffects !== false;

  /* ---------------------------------------------------------------- geometry */
  const selection = selectFont(dna, script, input.preferredFontId);
  const font = selection.font;

  let weight = Math.round(lerp(600, hints.weight, strength));
  // Very light lettering becomes unreadable at poster distance; nudge it back.
  weight = Math.round(lerp(weight, clamp(weight, 450, 850), readability * 0.6));
  weight = Math.round(clamp(weight, font.weightMin, font.weightMax));

  const strokeContrastRatio = lerp(1, hints.strokeContrastRatio, strength);
  const fontRatio = 1 + (font.contrast - 1) * 1.1;
  const contrastDeficit = Math.max(0, strokeContrastRatio - fontRatio);
  const nibWidthEm = clamp(contrastDeficit * 0.022, 0, 0.085) * strength * (1 - readability * 0.35);

  const slantDegrees = hints.slantDegrees * strength * (1 - readability * 0.2);
  const letterSpacingEm = clamp(
    lerp(0, hints.letterSpacingEm, strength) + readability * 0.022,
    -0.08,
    0.7,
  );
  const lineHeight = clamp(lerp(1.15, hints.lineHeight, strength) + readability * 0.05, 0.8, 2.4);
  const marginRatio = clamp(lerp(0.1, hints.marginRatio, strength * 0.75) + readability * 0.015, 0.03, 0.28);

  /* ------------------------------------------------------------------ colour */
  const referenceInk = dna.colorProfile.primaryColors.length
    ? dna.colorProfile.primaryColors
    : ['#1d1d1f'];
  const referenceBg = dna.colorProfile.backgroundColors.length
    ? dna.colorProfile.backgroundColors
    : ['#f5f5f7'];

  const monoInk = isLight(referenceBg[0]) ? '#141416' : '#f7f6f2';
  const monoBg = isLight(referenceBg[0]) ? '#ffffff' : '#0b0b0d';

  let inkColors = referenceInk.map((hex) => blendHex(hex, monoInk, 1 - colorMatch));
  let backgroundColors = referenceBg.map((hex) => blendHex(hex, monoBg, 1 - colorMatch));

  // Legibility guard: at high readability, force enough separation to survive print.
  if (readability > 0.45) {
    const ratio = contrastRatio(hexToRgb(inkColors[0]), hexToRgb(backgroundColors[0]));
    if (ratio < 3.2) {
      const bgLight = isLight(backgroundColors[0]);
      const rescue = bgLight ? '#101013' : '#fbfaf7';
      const push = clamp((3.2 - ratio) / 3.2, 0, 1) * readability;
      inkColors = inkColors.map((hex) => blendHex(hex, rescue, push));
    }
  }

  const gradientEnabled = !flat && hints.gradientKind !== 'none' && strength > 0.15;
  const gradientBase = inkColors[0];
  const gradientSecond =
    inkColors[1] ??
    (isLight(gradientBase) ? toHex(darken(hexToRgb(gradientBase), 0.3)) : toHex(lighten(hexToRgb(gradientBase), 0.35)));
  const gradient: GradientSpec | null = gradientEnabled
    ? {
        kind: hints.gradientKind === 'radial' ? 'radial' : 'linear',
        angleDegrees: hints.gradientAngleDegrees,
        stops: [
          { offset: 0, color: gradientBase },
          { offset: 1, color: blendHex(gradientSecond, gradientBase, 1 - strength * 0.9) },
        ],
      }
    : null;

  /* ----------------------------------------------------------------- effects */
  const effectScale = keepEffects ? 1 : 0;

  let outline: EffectiveStyle['outline'] = null;
  const outlineWidth = hints.outlineWidthEm * strength * (bias.outlineBoost ?? 1) * effectScale;
  if (outlineWidth > 0.002) {
    outline = {
      widthEm: clamp(outlineWidth, 0.004, 0.2),
      color: dna.colorProfile.outlineColor === 'none' ? monoBg : dna.colorProfile.outlineColor,
    };
  } else if (bias.outlineBoost && keepEffects) {
    // Sticker mode always gets a die-cut contour so the artwork reads on any surface.
    outline = { widthEm: 0.055, color: isLight(inkColors[0]) ? '#121214' : '#fdfdfb' };
  }

  const shadowStrengthBase = hints.shadowOffsetEm + hints.shadowBlurEm;
  const shadow: EffectiveStyle['shadow'] =
    shadowStrengthBase > 0.004 && effectScale && !flat
      ? {
          offsetEm: hints.shadowOffsetEm * strength,
          blurEm: hints.shadowBlurEm * strength,
          angleDegrees: hints.shadowAngleDegrees,
          color:
            dna.colorProfile.shadowColor === 'none'
              ? toHex(darken(hexToRgb(inkColors[0]), 0.55))
              : dna.colorProfile.shadowColor,
        }
      : null;

  const glowRadius = hints.glowRadiusEm * strength * effectScale * (flat ? 0 : 1);
  const glow: EffectiveStyle['glow'] =
    glowRadius > 0.01
      ? {
          radiusEm: glowRadius,
          color: inkColors.reduce((best, hex) => (isLight(hex) ? hex : best), inkColors[0]),
        }
      : null;

  const paperTexture = flat ? 0 : textureSlider * Math.max(hints.textureIntensity, 0.3) * effectScale;
  const grain = flat ? 0 : textureSlider * Math.max(hints.textureIntensity * 0.8, 0.22) * effectScale;
  const inkBleed = flat
    ? 0
    : textureSlider * 0.35 * Math.max(hints.inkBleedAmount, 0.2) * effectScale +
      roughSlider * Math.max(hints.inkBleedAmount, 0.25) * 0.65 * effectScale;
  const edgeRoughness = flat
    ? 0
    : roughSlider * Math.max(hints.edgeRoughness, 0.3) * (1 - readability * 0.65) * effectScale;

  const background: BackgroundSpec | null = isTransparent
    ? null
    : {
        kind: flat ? 'flat' : hints.backgroundKind,
        colors: backgroundColors,
        angleDegrees: hints.gradientAngleDegrees,
      };

  return {
    font,
    fontReasons: selection.reasons,
    fontScore: Math.round(selection.score),
    weight,
    slantDegrees,
    letterSpacingEm,
    lineHeight,
    alignment: hints.alignment,
    marginRatio,
    uppercase: (hints.uppercase || font.caps) && script === 'Latin',
    hierarchyContrast: clamp(lerp(0.8, hints.hierarchyContrast, strength), 0.3, 1),
    opticalScale: font.optical,
    nibWidthEm,
    penAngleDegrees: hints.penAngleDegrees,
    inkColors,
    gradient,
    outline,
    shadow,
    glow,
    embossStrength: flat ? 0 : hints.embossStrength * strength * effectScale,
    background,
    paperTexture,
    grain,
    inkBleed: clamp(inkBleed, 0, 1),
    edgeRoughness: clamp(edgeRoughness, 0, 1),
    ornamentation: ornamentSlider * (0.4 + 0.6 * hints.ornamentation),
    baselineJitterEm: hints.baselineJitterEm * strength * (1 - readability),
    transparent: isTransparent,
    vectorFriendly: bias.preferVector === true,
    strokeContrastRatio,
  };
}
