import { useCallback, useEffect, useMemo } from 'react';
import { ApiError, transliterateWithGemini } from '@/lib/api/client';
import {
  supportsPhonetic,
  transliterate,
  type TransliterationResult,
} from '@/lib/script/transliterate';
import { useNotify } from './hooks';
import { activeScript, useStudio } from './store';

export interface TransliterationState {
  /** Local rule-engine result for the current phonetic input, if applicable. */
  conversion: TransliterationResult | null;
  /** Gemini can refine spellings the rule engine only approximates. */
  canRefine: boolean;
  refine: () => Promise<void>;
  insert: (glyph: string) => void;
}

export function useTransliteration(): TransliterationState {
  const { state, dispatch } = useStudio();
  const notify = useNotify();
  const script = activeScript(state);
  const phonetic = state.typingMode === 'phonetic' && supportsPhonetic(script);

  const conversion = useMemo(() => {
    if (!phonetic || !supportsPhonetic(script)) return null;
    return transliterate(state.phoneticInput, script);
  }, [phonetic, script, state.phoneticInput]);

  // Keep the render string in sync with the phonetic field until the designer
  // takes over by editing the converted text directly.
  useEffect(() => {
    if (!conversion || state.textEditedByHand) return;
    // An empty phonetic field must not wipe text typed directly in native mode.
    if (!state.phoneticInput.trim()) return;
    if (conversion.output !== state.text) {
      dispatch({ type: 'text/set', value: conversion.output });
    }
  }, [conversion, dispatch, state.phoneticInput, state.text, state.textEditedByHand]);

  const refine = useCallback(async () => {
    if (!supportsPhonetic(script)) return;
    const source = state.phoneticInput.trim();
    if (!source) return;

    dispatch({ type: 'transliterate/start' });
    try {
      const response = await transliterateWithGemini({
        text: source,
        targetScript: script,
        currentGuess: conversion?.output,
      });
      if (response.converted.trim()) {
        dispatch({ type: 'text/set', value: response.converted, byHand: true });
        dispatch({
          type: 'transliterate/end',
          note:
            response.notes ||
            (response.alternatives.length
              ? `Alternatives: ${response.alternatives.join(' · ')}`
              : 'Refined by Gemini.'),
        });
      } else {
        dispatch({ type: 'transliterate/end', note: 'Gemini returned nothing usable — kept the local conversion.' });
      }
    } catch (error) {
      dispatch({ type: 'transliterate/end', note: null });
      notify({
        tone: 'warning',
        title: 'Could not refine the spelling',
        message:
          error instanceof ApiError
            ? error.message
            : 'The transliteration service was unreachable. The local conversion is still in place.',
        code: 'TRANSLITERATION_FAILED',
      });
    }
  }, [conversion, dispatch, notify, script, state.phoneticInput]);

  const insert = useCallback(
    (glyph: string) => {
      dispatch({ type: 'text/set', value: `${state.text}${glyph}`, byHand: true });
    },
    [dispatch, state.text],
  );

  return {
    conversion,
    canRefine: Boolean(state.capabilities?.aiTransliteration) && supportsPhonetic(script),
    refine,
    insert,
  };
}
