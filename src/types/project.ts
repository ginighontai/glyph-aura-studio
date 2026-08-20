import type { AnalyzedStyle, DetectedScript } from './styleDna';

export type LanguageId = 'en' | 'bn' | 'hi';
export type ScriptId = 'Latin' | 'Bengali' | 'Devanagari';
export type TypingMode = 'native' | 'phonetic';

export interface LanguageDefinition {
  id: LanguageId;
  label: string;
  endonym: string;
  script: ScriptId;
  supportsPhonetic: boolean;
  sample: string;
  phoneticSample: string;
}

export const LANGUAGES: LanguageDefinition[] = [
  {
    id: 'en',
    label: 'English',
    endonym: 'English',
    script: 'Latin',
    supportsPhonetic: false,
    sample: 'Golden Hour',
    phoneticSample: '',
  },
  {
    id: 'bn',
    label: 'Bengali',
    endonym: 'বাংলা',
    script: 'Bengali',
    supportsPhonetic: true,
    sample: 'আমি বাংলায় গান গাই',
    phoneticSample: 'ami banglay gan gai',
  },
  {
    id: 'hi',
    label: 'Hindi',
    endonym: 'हिन्दी',
    script: 'Devanagari',
    supportsPhonetic: true,
    sample: 'नमस्ते भारत',
    phoneticSample: 'namaste bharat',
  },
];

export const languageById = (id: LanguageId): LanguageDefinition =>
  LANGUAGES.find((language) => language.id === id) ?? LANGUAGES[0];

/* ------------------------------------------------------------ aspect ratios */

export type AspectRatioId =
  | '16:9'
  | '9:16'
  | '1:1'
  | '4:5'
  | '3:4'
  | 'a4-portrait'
  | 'a4-landscape'
  | 'custom';

export interface AspectRatioPreset {
  id: AspectRatioId;
  label: string;
  hint: string;
  /** Base render size in CSS pixels at 1×. */
  width: number;
  height: number;
  /** Aspect string understood by Gemini/Imagen, when one exists. */
  apiAspect?: string;
  print?: { widthMm: number; heightMm: number };
}

export const ASPECT_PRESETS: AspectRatioPreset[] = [
  { id: '16:9', label: '16 : 9', hint: 'Widescreen', width: 1920, height: 1080, apiAspect: '16:9' },
  { id: '9:16', label: '9 : 16', hint: 'Story / Reel', width: 1080, height: 1920, apiAspect: '9:16' },
  { id: '1:1', label: '1 : 1', hint: 'Square post', width: 1440, height: 1440, apiAspect: '1:1' },
  { id: '4:5', label: '4 : 5', hint: 'Portrait post', width: 1350, height: 1688, apiAspect: '4:5' },
  { id: '3:4', label: '3 : 4', hint: 'Classic print', width: 1440, height: 1920, apiAspect: '3:4' },
  {
    id: 'a4-portrait',
    label: 'A4 portrait',
    hint: '210 × 297 mm',
    width: 1240,
    height: 1754,
    apiAspect: '3:4',
    print: { widthMm: 210, heightMm: 297 },
  },
  {
    id: 'a4-landscape',
    label: 'A4 landscape',
    hint: '297 × 210 mm',
    width: 1754,
    height: 1240,
    apiAspect: '4:3',
    print: { widthMm: 297, heightMm: 210 },
  },
  { id: 'custom', label: 'Custom', hint: 'Your dimensions', width: 1600, height: 1600 },
];

export const aspectPreset = (id: AspectRatioId): AspectRatioPreset =>
  ASPECT_PRESETS.find((preset) => preset.id === id) ?? ASPECT_PRESETS[0];

/** Ceilings chosen so the layered renderer can allocate its temporaries. */
export const MAX_EXPORT_PIXELS = 40_000_000;
export const MAX_EXPORT_EDGE = 10_000;

/* ---------------------------------------------------------- generation modes */

export type GenerationModeId =
  | 'faithful'
  | 'clean-poster'
  | 'artistic'
  | 'vector-logo'
  | 'transparent-sticker';

export interface GenerationMode {
  id: GenerationModeId;
  label: string;
  blurb: string;
  /** Multipliers and overrides applied on top of the Style DNA render hints. */
  bias: {
    styleStrength?: number;
    readability?: number;
    ornamentation?: number;
    texture?: number;
    roughness?: number;
    forceTransparent?: boolean;
    forceFlat?: boolean;
    preferVector?: boolean;
    outlineBoost?: number;
  };
  promptNote: string;
}

export const GENERATION_MODES: GenerationMode[] = [
  {
    id: 'faithful',
    label: 'Faithful style transfer',
    blurb: 'Match the reference as closely as the engine can.',
    bias: {},
    promptNote:
      'Match the reference style as closely as possible: same stroke construction, same palette, same effects, same composition energy.',
  },
  {
    id: 'clean-poster',
    label: 'Clean poster',
    blurb: 'Same voice, tuned for legibility at a distance.',
    bias: { readability: 1.35, ornamentation: 0.45, texture: 0.5, roughness: 0.4 },
    promptNote:
      'Preserve the style but prioritise legibility: cleaner edges, calmer texture, stronger figure-ground contrast, restrained ornament.',
  },
  {
    id: 'artistic',
    label: 'Artistic calligraphy',
    blurb: 'Let the hand breathe — swashes, ink, expression.',
    bias: { ornamentation: 1.6, texture: 1.25, roughness: 1.35, styleStrength: 1.1 },
    promptNote:
      'Lean into expressive calligraphy: confident entry and exit strokes, generous swashes, living ink texture, dramatic thick-to-thin modulation.',
  },
  {
    id: 'vector-logo',
    label: 'Vector logo',
    blurb: 'Flat, crisp, export-ready shapes.',
    bias: { texture: 0, roughness: 0, ornamentation: 0.5, forceFlat: true, preferVector: true },
    promptNote:
      'Produce flat vector-ready artwork: hard clean edges, no grain, no paper texture, no photographic lighting, a small number of solid colours.',
  },
  {
    id: 'transparent-sticker',
    label: 'Transparent sticker',
    blurb: 'Isolated lettering on alpha, ready to place.',
    bias: { forceTransparent: true, outlineBoost: 1.6, texture: 0.6, ornamentation: 0.8 },
    promptNote:
      'Isolate the lettering as a die-cut sticker on a fully transparent background, with a clean contour and no scenery.',
  },
];

export const generationMode = (id: GenerationModeId): GenerationMode =>
  GENERATION_MODES.find((mode) => mode.id === id) ?? GENERATION_MODES[0];

/* --------------------------------------------------------- fidelity controls */

export interface FidelityControls {
  styleStrength: number;
  textReadability: number;
  ornamentation: number;
  textureIntensity: number;
  colorMatching: number;
  brushRoughness: number;
}

export const DEFAULT_FIDELITY: FidelityControls = {
  styleStrength: 85,
  textReadability: 62,
  ornamentation: 45,
  textureIntensity: 55,
  colorMatching: 90,
  brushRoughness: 45,
};

export interface FidelityControlDefinition {
  key: keyof FidelityControls;
  label: string;
  help: string;
  lowLabel: string;
  highLabel: string;
}

export const FIDELITY_CONTROLS: FidelityControlDefinition[] = [
  {
    key: 'styleStrength',
    label: 'Style strength',
    help: 'How hard the engine pushes towards the reference hand. Lower values drift back to neutral typography.',
    lowLabel: 'Neutral',
    highLabel: 'Reference',
  },
  {
    key: 'textReadability',
    label: 'Text readability',
    help: 'Trades expressive distortion for clarity: spacing, weight safety and figure-ground contrast.',
    lowLabel: 'Expressive',
    highLabel: 'Legible',
  },
  {
    key: 'ornamentation',
    label: 'Ornamentation',
    help: 'Swashes, flourishes, rules and decorative marks around the lettering.',
    lowLabel: 'Bare',
    highLabel: 'Ornate',
  },
  {
    key: 'textureIntensity',
    label: 'Texture intensity',
    help: 'Paper grain, ink speckle and substrate texture across the poster.',
    lowLabel: 'Smooth',
    highLabel: 'Tactile',
  },
  {
    key: 'colorMatching',
    label: 'Colour matching',
    help: 'How literally the reference palette is reproduced. At zero the poster renders monochrome.',
    lowLabel: 'Monochrome',
    highLabel: 'Exact',
  },
  {
    key: 'brushRoughness',
    label: 'Brush roughness',
    help: 'Dry-brush breakup and edge erosion along the strokes.',
    lowLabel: 'Clean',
    highLabel: 'Dry brush',
  },
];

/* ------------------------------------------------------------------- engines */

export type EngineId = 'vector' | 'ai-image';

export interface EngineDefinition {
  id: EngineId;
  label: string;
  blurb: string;
  needsGemini: boolean;
}

export const ENGINES: EngineDefinition[] = [
  {
    id: 'vector',
    label: 'Vector engine',
    blurb:
      'Deterministic type engine running in your browser. Exact text by construction, true SVG export, no API key required.',
    needsGemini: false,
  },
  {
    id: 'ai-image',
    label: 'AI image engine',
    blurb:
      'Gemini renders the poster as a raster image. Richer painterly texture, verified afterwards by OCR.',
    needsGemini: true,
  },
];

/* -------------------------------------------------------------------- upload */

export interface ReferenceImage {
  name: string;
  mimeType: string;
  sizeBytes: number;
  width: number;
  height: number;
  /** Object URL for display. */
  objectUrl: string;
  /** Raw base64 payload (no data: prefix) for API calls. */
  base64: string;
}

/* ------------------------------------------------------------------- outputs */

export type OutputKind = 'vector' | 'raster';

export interface GeneratedOutput {
  id: string;
  kind: OutputKind;
  engine: EngineId;
  /** Displayable URL (object URL for raster, data URL for canvas output). */
  url: string;
  width: number;
  height: number;
  transparent: boolean;
  createdAt: number;
  aspectRatio: AspectRatioId;
  text: string;
  script: ScriptId;
  fontFamily?: string;
  fontId?: string;
  prompt: string;
  negativePrompt: string;
  note?: string | null;
  modelUsed?: string | null;
  elapsedMs: number;
}

export type FidelityStatus = 'guaranteed' | 'verified' | 'mismatch' | 'unavailable' | 'checking';

export interface FidelityReport {
  status: FidelityStatus;
  expected: string;
  recognized?: string;
  similarity?: number;
  message: string;
  detail?: string;
}

/* -------------------------------------------------------------------- export */

export type ExportFormat = 'png' | 'jpg' | 'svg';

export interface ExportSettings {
  format: ExportFormat;
  scale: 1 | 2 | 4;
  transparent: boolean;
  typographyOnly: boolean;
  preserveEffects: boolean;
  vectorize: boolean;
  embedFontInSvg: boolean;
  jpgQuality: number;
}

export const DEFAULT_EXPORT: ExportSettings = {
  format: 'png',
  scale: 2,
  transparent: false,
  typographyOnly: false,
  preserveEffects: true,
  vectorize: false,
  embedFontInSvg: true,
  jpgQuality: 0.94,
};

/* -------------------------------------------------------------------- stages */

export type StageId =
  | 'read-reference'
  | 'extract-dna'
  | 'build-prompt'
  | 'render'
  | 'verify'
  | 'prepare-export';

export interface StageDefinition {
  id: StageId;
  label: string;
  detail: string;
}

export const STAGES: StageDefinition[] = [
  { id: 'read-reference', label: 'Reading reference', detail: 'Decoding pixels and sampling the artwork' },
  { id: 'extract-dna', label: 'Extracting style DNA', detail: 'Measuring strokes, palette, effects, composition' },
  { id: 'build-prompt', label: 'Building generation prompt', detail: 'Composing instructions and guard rails' },
  { id: 'render', label: 'Rendering poster', detail: 'Laying out and drawing your text in the reference hand' },
  { id: 'verify', label: 'Checking text fidelity', detail: 'Confirming every character survived' },
  { id: 'prepare-export', label: 'Preparing export', detail: 'Packaging raster and vector deliverables' },
];

export type StageState = 'pending' | 'active' | 'done' | 'failed' | 'skipped';

export interface StageProgress {
  id: StageId;
  state: StageState;
  note?: string;
}

/* --------------------------------------------------------------- app failure */

export type ErrorCode =
  | 'NO_IMAGE'
  | 'UNSUPPORTED_IMAGE_TYPE'
  | 'IMAGE_TOO_LARGE'
  | 'EMPTY_TEXT'
  | 'ANALYSIS_FAILED'
  | 'GENERATION_FAILED'
  | 'TEXT_MISMATCH'
  | 'EXPORT_FAILED'
  | 'TRANSLITERATION_FAILED'
  | 'FONT_LOAD_FAILED'
  | 'NETWORK';

export interface AppNotice {
  id: string;
  tone: 'error' | 'warning' | 'success' | 'info';
  title: string;
  message: string;
  code?: ErrorCode;
  actionLabel?: string;
  action?: () => void;
}

/* ------------------------------------------------------------------ analysis */

export interface AnalysisState {
  status: 'idle' | 'running' | 'ready' | 'failed';
  style?: AnalyzedStyle;
  error?: string;
  /** Script the user forced for the reference, or 'auto'. */
  scriptHint: DetectedScript | 'auto';
}
