import { createContext, useContext, useEffect, useMemo, useReducer, type ReactNode } from 'react';
import type { Capabilities } from '@/lib/api/client';
import type { PromptBundle } from '@/lib/prompt/build';
import {
  DEFAULT_EXPORT,
  DEFAULT_FIDELITY,
  STAGES,
  languageById,
  type AnalysisState,
  type AppNotice,
  type AspectRatioId,
  type EngineId,
  type ExportSettings,
  type FidelityControls,
  type FidelityReport,
  type GeneratedOutput,
  type GenerationModeId,
  type LanguageId,
  type ReferenceImage,
  type ScriptId,
  type StageId,
  type StageProgress,
  type StageState,
  type TypingMode,
} from '@/types/project';
import type { AnalyzedStyle, DetectedScript } from '@/types/styleDna';

export interface StudioState {
  theme: 'light' | 'dark';
  capabilities: Capabilities | null;
  capabilityChecked: boolean;

  reference: ReferenceImage | null;
  analysis: AnalysisState;
  activePresetId: string | null;

  language: LanguageId;
  typingMode: TypingMode;
  phoneticInput: string;
  /** The exact string that will be set on the poster. */
  text: string;
  textEditedByHand: boolean;
  transliterating: boolean;
  transliterationNote: string | null;

  aspect: AspectRatioId;
  customSize: { width: number; height: number };
  mode: GenerationModeId;
  engine: EngineId;
  fidelity: FidelityControls;
  fontOverride: string | null;
  transparent: boolean;
  vectorize: boolean;
  exportSettings: ExportSettings;

  stages: StageProgress[];
  generating: boolean;
  output: GeneratedOutput | null;
  fidelityReport: FidelityReport | null;
  prompt: PromptBundle | null;
  promptDraft: string | null;
  renderNotes: string[];
  svg: { markup: string; approximations: string[] } | null;
  zoom: number;

  notices: AppNotice[];
  helpOpen: boolean;
}

const freshStages = (): StageProgress[] =>
  STAGES.map((stage) => ({ id: stage.id, state: 'pending' as StageState }));

const initialState: StudioState = {
  theme: 'light',
  capabilities: null,
  capabilityChecked: false,

  reference: null,
  analysis: { status: 'idle', scriptHint: 'auto' },
  activePresetId: null,

  language: 'en',
  typingMode: 'native',
  phoneticInput: '',
  text: '',
  textEditedByHand: false,
  transliterating: false,
  transliterationNote: null,

  aspect: '4:5',
  customSize: { width: 1600, height: 1000 },
  mode: 'faithful',
  engine: 'vector',
  fidelity: { ...DEFAULT_FIDELITY },
  fontOverride: null,
  transparent: false,
  vectorize: false,
  exportSettings: { ...DEFAULT_EXPORT },

  stages: freshStages(),
  generating: false,
  output: null,
  fidelityReport: null,
  prompt: null,
  promptDraft: null,
  renderNotes: [],
  svg: null,
  zoom: 1,

  notices: [],
  helpOpen: false,
};

export type StudioAction =
  | { type: 'theme/set'; theme: 'light' | 'dark' }
  | { type: 'capabilities/set'; capabilities: Capabilities | null }
  | { type: 'reference/set'; reference: ReferenceImage }
  | { type: 'reference/clear' }
  | { type: 'reference/scriptHint'; hint: DetectedScript | 'auto' }
  | { type: 'analysis/start' }
  | { type: 'analysis/success'; style: AnalyzedStyle }
  | { type: 'analysis/fail'; error: string }
  | { type: 'preset/apply'; presetId: string; style: AnalyzedStyle; text?: string; mode?: GenerationModeId }
  | { type: 'preset/clear' }
  | { type: 'language/set'; language: LanguageId }
  | { type: 'typingMode/set'; mode: TypingMode }
  | { type: 'phonetic/set'; value: string }
  | { type: 'text/set'; value: string; byHand?: boolean }
  | { type: 'transliterate/start' }
  | { type: 'transliterate/end'; note?: string | null }
  | { type: 'aspect/set'; aspect: AspectRatioId }
  | { type: 'customSize/set'; width: number; height: number }
  | { type: 'mode/set'; mode: GenerationModeId }
  | { type: 'engine/set'; engine: EngineId }
  | { type: 'fidelity/set'; key: keyof FidelityControls; value: number }
  | { type: 'fidelity/reset' }
  | { type: 'font/override'; fontId: string | null }
  | { type: 'transparent/set'; value: boolean }
  | { type: 'vectorize/set'; value: boolean }
  | { type: 'export/set'; patch: Partial<ExportSettings> }
  | { type: 'stage/set'; id: StageId; state: StageState; note?: string }
  | { type: 'stages/reset' }
  | { type: 'generate/start' }
  | { type: 'generate/success'; output: GeneratedOutput; notes: string[]; svg: StudioState['svg'] }
  | { type: 'generate/fail' }
  | { type: 'fidelityReport/set'; report: FidelityReport | null }
  | { type: 'prompt/set'; prompt: PromptBundle | null }
  | { type: 'prompt/draft'; draft: string | null }
  | { type: 'zoom/set'; zoom: number }
  | { type: 'notice/push'; notice: AppNotice }
  | { type: 'notice/dismiss'; id: string }
  | { type: 'help/set'; open: boolean };

function reducer(state: StudioState, action: StudioAction): StudioState {
  switch (action.type) {
    case 'theme/set':
      return { ...state, theme: action.theme };

    case 'capabilities/set':
      return { ...state, capabilities: action.capabilities, capabilityChecked: true };

    case 'reference/set':
      return {
        ...state,
        reference: action.reference,
        activePresetId: null,
        analysis: { ...state.analysis, status: 'idle', error: undefined },
      };

    case 'reference/clear':
      return {
        ...state,
        reference: null,
        analysis: { status: 'idle', scriptHint: 'auto' },
        activePresetId: null,
      };

    case 'reference/scriptHint':
      return { ...state, analysis: { ...state.analysis, scriptHint: action.hint } };

    case 'analysis/start':
      return { ...state, analysis: { ...state.analysis, status: 'running', error: undefined } };

    case 'analysis/success':
      return {
        ...state,
        analysis: { ...state.analysis, status: 'ready', style: action.style, error: undefined },
      };

    case 'analysis/fail':
      return { ...state, analysis: { ...state.analysis, status: 'failed', error: action.error } };

    case 'preset/apply': {
      const nextText = action.text ?? state.text;
      return {
        ...state,
        reference: null,
        activePresetId: action.presetId,
        analysis: { status: 'ready', style: action.style, scriptHint: action.style.dna.detectedScript },
        mode: action.mode ?? state.mode,
        text: nextText,
        phoneticInput: action.text ? '' : state.phoneticInput,
        textEditedByHand: action.text ? false : state.textEditedByHand,
        fontOverride: null,
      };
    }

    case 'preset/clear':
      return { ...state, activePresetId: null };

    case 'language/set': {
      if (action.language === state.language) return state;
      const definition = languageById(action.language);
      return {
        ...state,
        language: action.language,
        // Latin has no phonetic layer, so always land on direct typing there.
        typingMode: definition.supportsPhonetic ? state.typingMode : 'native',
        // The old string belongs to another script; clear it rather than
        // pretending it still applies.
        text: '',
        phoneticInput: '',
        textEditedByHand: false,
        transliterationNote: null,
        fontOverride: null,
      };
    }

    case 'typingMode/set':
      return { ...state, typingMode: action.mode, transliterationNote: null };

    case 'phonetic/set':
      return { ...state, phoneticInput: action.value, textEditedByHand: false };

    case 'text/set':
      return {
        ...state,
        text: action.value,
        textEditedByHand: action.byHand ? true : state.textEditedByHand,
      };

    case 'transliterate/start':
      return { ...state, transliterating: true };

    case 'transliterate/end':
      return { ...state, transliterating: false, transliterationNote: action.note ?? null };

    case 'aspect/set':
      return { ...state, aspect: action.aspect };

    case 'customSize/set':
      return { ...state, customSize: { width: action.width, height: action.height } };

    case 'mode/set': {
      // Sticker mode implies transparency; make that visible in the toggle
      // rather than silently overriding it later.
      const transparent = action.mode === 'transparent-sticker' ? true : state.transparent;
      const vectorize = action.mode === 'vector-logo' ? true : state.vectorize;
      return { ...state, mode: action.mode, transparent, vectorize };
    }

    case 'engine/set':
      return { ...state, engine: action.engine };

    case 'fidelity/set':
      return { ...state, fidelity: { ...state.fidelity, [action.key]: action.value } };

    case 'fidelity/reset':
      return { ...state, fidelity: { ...DEFAULT_FIDELITY }, fontOverride: null };

    case 'font/override':
      return { ...state, fontOverride: action.fontId };

    case 'transparent/set':
      return {
        ...state,
        transparent: action.value,
        exportSettings: { ...state.exportSettings, transparent: action.value },
      };

    case 'vectorize/set':
      return {
        ...state,
        vectorize: action.value,
        exportSettings: {
          ...state.exportSettings,
          vectorize: action.value,
          format: action.value ? 'svg' : state.exportSettings.format,
        },
      };

    case 'export/set':
      return { ...state, exportSettings: { ...state.exportSettings, ...action.patch } };

    case 'stage/set':
      return {
        ...state,
        stages: state.stages.map((stage) =>
          stage.id === action.id ? { id: stage.id, state: action.state, note: action.note } : stage,
        ),
      };

    case 'stages/reset':
      return { ...state, stages: freshStages() };

    case 'generate/start':
      return { ...state, generating: true, stages: freshStages(), fidelityReport: null };

    case 'generate/success':
      return {
        ...state,
        generating: false,
        output: action.output,
        renderNotes: action.notes,
        svg: action.svg,
        zoom: 1,
      };

    case 'generate/fail':
      return { ...state, generating: false };

    case 'fidelityReport/set':
      return { ...state, fidelityReport: action.report };

    case 'prompt/set':
      return { ...state, prompt: action.prompt };

    case 'prompt/draft':
      return { ...state, promptDraft: action.draft };

    case 'zoom/set':
      return { ...state, zoom: action.zoom };

    case 'notice/push':
      return { ...state, notices: [...state.notices.slice(-3), action.notice] };

    case 'notice/dismiss':
      return { ...state, notices: state.notices.filter((notice) => notice.id !== action.id) };

    case 'help/set':
      return { ...state, helpOpen: action.open };

    default:
      return state;
  }
}

interface StudioContextValue {
  state: StudioState;
  dispatch: (action: StudioAction) => void;
}

const StudioContext = createContext<StudioContextValue | null>(null);

const THEME_KEY = 'glyphaura.theme';

function readInitialTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  const stored = window.localStorage.getItem(THEME_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function StudioProvider({ children }: { children?: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState, (base) => ({
    ...base,
    theme: readInitialTheme(),
  }));

  useEffect(() => {
    document.documentElement.dataset.theme = state.theme;
    window.localStorage.setItem(THEME_KEY, state.theme);
  }, [state.theme]);

  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <StudioContext.Provider value={value}>{children}</StudioContext.Provider>;
}

export function useStudio(): StudioContextValue {
  const value = useContext(StudioContext);
  if (!value) throw new Error('useStudio must be used inside <StudioProvider>.');
  return value;
}

/* ------------------------------------------------------------------ selectors */

export const activeScript = (state: StudioState): ScriptId => languageById(state.language).script;

export const hasStyle = (state: StudioState): boolean =>
  state.analysis.status === 'ready' && Boolean(state.analysis.style);

export interface GenerateReadiness {
  ready: boolean;
  reason: string | null;
}

export function generateReadiness(state: StudioState): GenerateReadiness {
  if (state.generating) return { ready: false, reason: 'Generating…' };
  if (!hasStyle(state)) {
    return {
      ready: false,
      reason: state.analysis.status === 'running'
        ? 'Analysing the reference…'
        : 'Upload a reference image or pick an example style first.',
    };
  }
  if (!state.text.trim()) return { ready: false, reason: 'Type the text you want to set.' };
  if (state.engine === 'ai-image' && !state.capabilities?.imageGeneration) {
    return { ready: false, reason: 'The AI image engine needs a Gemini API key on the server.' };
  }
  return { ready: true, reason: null };
}

export const createNoticeId = (): string =>
  `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
