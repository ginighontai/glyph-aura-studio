/**
 * Structured-output schema for the Style DNA object.
 *
 * Gemini accepts a subset of the OpenAPI 3 schema vocabulary in
 * `generationConfig.responseSchema`, which lets us skip fragile prompt-only
 * JSON coaxing and get a stable object shape back every time.
 */

const s = (description) => ({ type: 'STRING', description });

const stringList = (description) => ({
  type: 'ARRAY',
  description,
  items: { type: 'STRING' },
});

export const STYLE_DNA_SCHEMA = {
  type: 'OBJECT',
  properties: {
    detectedScript: {
      type: 'STRING',
      enum: ['Latin', 'Bengali', 'Devanagari', 'Mixed', 'Unknown'],
      description: 'Dominant writing system visible in the reference image.',
    },
    detectedReferenceText: s('Verbatim text read from the reference image, in its original script.'),
    typographyCategory: {
      type: 'STRING',
      enum: [
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
      ],
    },
    strokeProfile: {
      type: 'OBJECT',
      properties: {
        averageStrokeWidth: s('e.g. "hairline", "medium ~7% of cap height", "very heavy".'),
        strokeContrast: s('Thick-to-thin ratio and where the thick strokes fall.'),
        pressureVariation: s('How pressure changes along strokes; entry and exit behaviour.'),
        edgeQuality: s('Crisp vector, slightly rough, torn, dry-brush, bleeding, etc.'),
        brushTexture: s('Tool implied: flat brush, pointed nib, marker, chisel, spray, none.'),
      },
      required: [
        'averageStrokeWidth',
        'strokeContrast',
        'pressureVariation',
        'edgeQuality',
        'brushTexture',
      ],
    },
    formProfile: {
      type: 'OBJECT',
      properties: {
        xHeightOrScriptScale: s('x-height ratio for Latin, or matra/headline proportions for Indic.'),
        curves: s('Curve character: geometric, humanist, oval, angular, wobbly.'),
        terminals: s('Stroke endings: flared, tapered, blunt, ball, sheared, spurred.'),
        ligatures: s('Ligature and conjunct behaviour; for Indic, how juktakkhor are treated.'),
        flourishes: s('Swashes, entry/exit strokes, ornamental extensions.'),
        slant: s('Approximate slant in degrees and direction.'),
        baseline: s('Baseline behaviour: rigid, bouncy, arched, wavy, stepped.'),
      },
      required: [
        'xHeightOrScriptScale',
        'curves',
        'terminals',
        'ligatures',
        'flourishes',
        'slant',
        'baseline',
      ],
    },
    colorProfile: {
      type: 'OBJECT',
      properties: {
        primaryColors: stringList('Hex codes for the dominant lettering colours, most used first.'),
        secondaryColors: stringList('Hex codes for accents, highlights and secondary type.'),
        gradientDescription: s('Direction, stops and softness of any gradient on the lettering.'),
        shadowColor: s('Hex code of the drop shadow, or "none".'),
        outlineColor: s('Hex code of the letter outline/stroke, or "none".'),
        backgroundColors: stringList('Hex codes describing the background, most used first.'),
      },
      required: [
        'primaryColors',
        'secondaryColors',
        'gradientDescription',
        'shadowColor',
        'outlineColor',
        'backgroundColors',
      ],
    },
    effectsProfile: {
      type: 'OBJECT',
      properties: {
        shadow: s('Offset, blur, opacity and colour of shadows, or "none".'),
        outline: s('Outline weight and treatment, or "none".'),
        glow: s('Glow/neon bloom description, or "none".'),
        emboss: s('Emboss, letterpress or bevel description, or "none".'),
        inkBleed: s('Ink spread, feathering into paper fibres, or "none".'),
        paperTexture: s('Substrate: smooth paper, watercolour cold press, canvas, concrete, none.'),
        grain: s('Film grain / noise level and character.'),
        lighting: s('Light direction and quality implied by the artwork.'),
      },
      required: [
        'shadow',
        'outline',
        'glow',
        'emboss',
        'inkBleed',
        'paperTexture',
        'grain',
        'lighting',
      ],
    },
    compositionProfile: {
      type: 'OBJECT',
      properties: {
        layout: s('Overall poster layout and how the type is arranged in the frame.'),
        alignment: s('left, centred, right, justified, arced, free.'),
        margins: s('Margin proportions relative to canvas width.'),
        textHierarchy: s('How many type sizes/levels and their relationship.'),
        decorativeElements: s('Rules, frames, ornaments, motifs, illustration.'),
      },
      required: ['layout', 'alignment', 'margins', 'textHierarchy', 'decorativeElements'],
    },
    renderHints: {
      type: 'OBJECT',
      description: 'Numeric hints the deterministic vector engine can consume directly.',
      properties: {
        fontCategory: {
          type: 'STRING',
          enum: [
            'serif',
            'sans',
            'slab',
            'display',
            'script',
            'brush',
            'blackletter',
            'monospace',
            'rounded',
          ],
        },
        weight: { type: 'INTEGER', description: 'Target font weight 100-900.' },
        slantDegrees: { type: 'NUMBER', description: 'Negative leans left, positive leans right.' },
        letterSpacingEm: { type: 'NUMBER', description: 'Tracking in em units, -0.1 to 0.6.' },
        lineHeight: { type: 'NUMBER', description: 'Line height multiple, 0.85 to 2.0.' },
        strokeContrastRatio: { type: 'NUMBER', description: '1 = monoline, 8 = extreme contrast.' },
        outlineWidthEm: { type: 'NUMBER' },
        shadowOffsetEm: { type: 'NUMBER' },
        shadowBlurEm: { type: 'NUMBER' },
        glowRadiusEm: { type: 'NUMBER' },
        textureIntensity: { type: 'NUMBER', description: '0-1.' },
        inkBleedAmount: { type: 'NUMBER', description: '0-1.' },
        uppercase: { type: 'BOOLEAN', description: 'True when Latin reference text is all caps.' },
        gradientAngleDegrees: { type: 'NUMBER' },
      },
      required: ['fontCategory', 'weight', 'slantDegrees', 'letterSpacingEm', 'lineHeight'],
    },
    generationPrompt: s('A dense, self-contained prompt describing how to draw new text in this style.'),
    negativePrompt: s('What the renderer must avoid.'),
    confidenceScore: {
      type: 'NUMBER',
      description: 'Confidence in this analysis from 0 to 1.',
    },
    userWarnings: stringList('Plain-language caveats the designer should know about.'),
  },
  required: [
    'detectedScript',
    'detectedReferenceText',
    'typographyCategory',
    'strokeProfile',
    'formProfile',
    'colorProfile',
    'effectsProfile',
    'compositionProfile',
    'renderHints',
    'generationPrompt',
    'negativePrompt',
    'confidenceScore',
    'userWarnings',
  ],
};

export const OCR_SCHEMA = {
  type: 'OBJECT',
  properties: {
    text: { type: 'STRING', description: 'All legible text, reading order preserved.' },
    script: {
      type: 'STRING',
      enum: ['Latin', 'Bengali', 'Devanagari', 'Mixed', 'Unknown'],
    },
    legibility: { type: 'NUMBER', description: '0-1 how clearly the text could be read.' },
    notes: { type: 'STRING' },
  },
  required: ['text', 'script', 'legibility'],
};

export const TRANSLITERATION_SCHEMA = {
  type: 'OBJECT',
  properties: {
    converted: { type: 'STRING', description: 'The text in the requested target script.' },
    alternatives: {
      type: 'ARRAY',
      items: { type: 'STRING' },
      description: 'Up to three plausible alternative spellings.',
    },
    notes: { type: 'STRING' },
  },
  required: ['converted'],
};
