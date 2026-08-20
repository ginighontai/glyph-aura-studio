import {
  aspectPreset,
  generationMode,
  type AspectRatioId,
  type FidelityControls,
  type GenerationModeId,
  type ScriptId,
} from '@/types/project';
import type { StyleDna } from '@/types/styleDna';
import type { EffectiveStyle } from '../render/params';
import { describeColor } from '../analysis/color';

export interface PromptSection {
  title: string;
  body: string;
}

export interface PromptBundle {
  prompt: string;
  negativePrompt: string;
  sections: PromptSection[];
}

export interface PromptInput {
  dna: StyleDna;
  style: EffectiveStyle;
  text: string;
  script: ScriptId;
  aspectRatio: AspectRatioId;
  canvas: { width: number; height: number };
  transparent: boolean;
  vectorize: boolean;
  mode: GenerationModeId;
  fidelity: FidelityControls;
  /** Set after a failed fidelity check — tightens the text guard rails. */
  strict?: boolean;
}

const SCRIPT_NAMES: Record<ScriptId, string> = {
  Latin: 'Latin (English)',
  Bengali: 'Bengali (বাংলা)',
  Devanagari: 'Devanagari (हिन्दी)',
};

const level = (value: number): string => {
  if (value >= 85) return 'very high';
  if (value >= 65) return 'high';
  if (value >= 40) return 'moderate';
  if (value >= 18) return 'low';
  return 'minimal';
};

/**
 * Assembles the full generation instruction.
 *
 * The same bundle powers the Prompt Inspector, so what the designer reads and
 * can edit is exactly what the image model receives — no hidden second prompt.
 */
export function buildPrompt(input: PromptInput): PromptBundle {
  const { dna, style, text, script } = input;
  const mode = generationMode(input.mode);
  const preset = aspectPreset(input.aspectRatio);
  const lines = text.split('\n').filter((line) => line.trim().length > 0);

  const textBlock = `Render this exact text, character for character, in ${SCRIPT_NAMES[script]} script:
<<<${text}>>>
It is ${[...text].length} characters across ${lines.length} line${lines.length === 1 ? '' : 's'}.${
    lines.length > 1
      ? `\nLine breaks are meaningful — keep this arrangement:\n${lines.map((line, index) => `  ${index + 1}. ${line}`).join('\n')}`
      : ''
  }`;

  const styleBlock = [
    `Typography category: ${dna.typographyCategory}. Shape family: ${style.font.category}.`,
    `Stroke width: ${dna.strokeProfile.averageStrokeWidth}.`,
    `Stroke contrast: ${dna.strokeProfile.strokeContrast}.`,
    `Pressure: ${dna.strokeProfile.pressureVariation}.`,
    `Edges: ${dna.strokeProfile.edgeQuality}.`,
    `Tool: ${dna.strokeProfile.brushTexture}.`,
    `Curves: ${dna.formProfile.curves}. Terminals: ${dna.formProfile.terminals}.`,
    `Ligatures and conjuncts: ${dna.formProfile.ligatures}.`,
    `Flourishes: ${dna.formProfile.flourishes}.`,
    `Slant: ${dna.formProfile.slant}. Baseline: ${dna.formProfile.baseline}.`,
    `Proportions: ${dna.formProfile.xHeightOrScriptScale}.`,
  ].join('\n');

  const colorBlock = [
    `Lettering colours: ${dna.colorProfile.primaryColors
      .map((hex) => `${hex} (${describeColor(hex)})`)
      .join(', ')}.`,
    dna.colorProfile.secondaryColors.length
      ? `Accents: ${dna.colorProfile.secondaryColors.join(', ')}.`
      : 'No accent colours.',
    `Gradient: ${dna.colorProfile.gradientDescription}.`,
    `Outline: ${dna.colorProfile.outlineColor}. Shadow: ${dna.colorProfile.shadowColor}.`,
    input.transparent
      ? 'Background: fully transparent alpha — no ground, no scenery, no checkerboard.'
      : `Background: ${dna.colorProfile.backgroundColors.join(', ')} — ${dna.effectsProfile.lighting}.`,
  ].join('\n');

  const effectsBlock = [
    `Shadow: ${dna.effectsProfile.shadow}.`,
    `Outline: ${dna.effectsProfile.outline}.`,
    `Glow: ${dna.effectsProfile.glow}.`,
    `Emboss: ${dna.effectsProfile.emboss}.`,
    `Ink bleed: ${dna.effectsProfile.inkBleed}.`,
    `Substrate: ${dna.effectsProfile.paperTexture}. Grain: ${dna.effectsProfile.grain}.`,
    `Lighting: ${dna.effectsProfile.lighting}.`,
  ].join('\n');

  const compositionBlock = [
    `Layout: ${dna.compositionProfile.layout}.`,
    `Alignment: ${dna.compositionProfile.alignment}. Margins: ${dna.compositionProfile.margins}.`,
    `Hierarchy: ${dna.compositionProfile.textHierarchy}.`,
    `Decoration: ${dna.compositionProfile.decorativeElements}.`,
    `Canvas: ${preset.label} (${input.canvas.width} × ${input.canvas.height}px).`,
  ].join('\n');

  const controlBlock = [
    `Style fidelity to the reference: ${level(input.fidelity.styleStrength)}.`,
    `Legibility priority: ${level(input.fidelity.textReadability)}.`,
    `Ornamentation: ${level(input.fidelity.ornamentation)}.`,
    `Texture intensity: ${level(input.fidelity.textureIntensity)}.`,
    `Colour matching: ${level(input.fidelity.colorMatching)}.`,
    `Brush roughness: ${level(input.fidelity.brushRoughness)}.`,
    `Mode — ${mode.label}: ${mode.promptNote}`,
    input.vectorize
      ? 'Vector intent: crisp flat shapes with clean contours, suitable for path tracing. No photographic blur, no soft focus.'
      : '',
    script !== 'Latin'
      ? `Script integrity: this is ${SCRIPT_NAMES[script]}. Every matra, kar sign, conjunct and diacritic must be drawn correctly and attached to the right consonant. Do not substitute Latin letterforms.`
      : '',
  ]
    .filter(Boolean)
    .join('\n');

  const guard = input.strict
    ? `TEXT FIDELITY — MAXIMUM STRICTNESS (a previous attempt altered the text):
Copy the characters between <<< and >>> literally. Compare your output against the source string glyph by glyph before finishing. If you cannot fit the string, reduce the type size — never drop, merge, translate or invent characters. Do not add any word that is not in the string. Do not add a signature, watermark, caption or translation.`
    : `TEXT FIDELITY:
Reproduce the text between <<< and >>> exactly. Do not change, misspell, translate, transliterate, summarise, reorder or replace any character. Preserve the script exactly. Apply only the visual style from the reference image.`;

  const sections: PromptSection[] = [
    { title: 'Task', body: `Create a ${preset.label} typographic poster.\n\n${textBlock}` },
    { title: 'Letterform style', body: styleBlock },
    { title: 'Colour', body: colorBlock },
    { title: 'Effects', body: effectsBlock },
    { title: 'Composition', body: compositionBlock },
    { title: 'Studio controls', body: controlBlock },
    ...(dna.generationPrompt ? [{ title: 'Analyst brief', body: dna.generationPrompt }] : []),
    { title: 'Text fidelity', body: guard },
  ];

  const prompt = sections.map((section) => `## ${section.title}\n${section.body}`).join('\n\n');

  const negativePrompt = [
    dna.negativePrompt,
    'misspelled text, altered wording, invented words, translated text, transliterated text',
    'broken conjuncts, detached matras, wrong script, Latin letters substituted for Indic glyphs',
    'watermark, signature, caption, subtitle, lorem ipsum, UI chrome, stock photo framing',
    'low resolution, jpeg artefacts, blurry glyphs, double exposure of the text',
    input.transparent ? 'opaque background, checkerboard pattern, coloured backdrop' : '',
    input.vectorize ? 'photographic depth of field, heavy noise, gradient banding' : '',
  ]
    .filter(Boolean)
    .join(', ');

  return { prompt, negativePrompt, sections };
}

/** Short human summary used in the output card and export metadata. */
export function summarisePrompt(style: EffectiveStyle, script: ScriptId): string {
  return [
    `${style.font.family} · weight ${style.weight}`,
    `${SCRIPT_NAMES[script]}`,
    style.gradient ? 'gradient fill' : 'flat fill',
    style.shadow ? 'drop shadow' : null,
    style.glow ? 'glow' : null,
    style.outline ? 'outline' : null,
    style.transparent ? 'transparent ground' : 'painted ground',
  ]
    .filter(Boolean)
    .join(' · ');
}
