import { useCallback } from 'react';
import { ApiError, analyzeReference } from '@/lib/api/client';
import { analyzeLocally, imageDataFromBlob, measureImage } from '@/lib/analysis/localAnalyzer';
import { LANGUAGES, type ReferenceImage } from '@/types/project';
import { normalizeStyleDna, type AnalyzedStyle, type DetectedScript } from '@/types/styleDna';
import { artifacts, resetArtifacts } from './artifacts';
import { useNotify } from './hooks';
import { useStudio } from './store';

export const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
export const MAX_UPLOAD_MB = 12;

const readBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('The file could not be read.'));
    reader.onload = () => {
      const result = String(reader.result ?? '');
      const comma = result.indexOf(',');
      resolve(comma === -1 ? result : result.slice(comma + 1));
    };
    reader.readAsDataURL(file);
  });

export function useReference() {
  const { state, dispatch } = useStudio();
  const notify = useNotify();

  /** Runs the analyst: Gemini when configured, the local engine otherwise. */
  const analyze = useCallback(
    async (reference: ReferenceImage, scriptHint: DetectedScript | 'auto') => {
      dispatch({ type: 'analysis/start' });

      const runLocal = async (fallbackReason?: string): Promise<AnalyzedStyle> => {
        const pixels =
          artifacts.referencePixels ??
          (await imageDataFromBlob(await (await fetch(reference.objectUrl)).blob()));
        artifacts.referencePixels = pixels;
        const result = analyzeLocally(pixels, {
          scriptHint,
          sourceName: reference.name,
        });
        return fallbackReason
          ? { ...result, meta: { ...result.meta, fallbackReason } }
          : result;
      };

      try {
        let style: AnalyzedStyle;

        if (state.capabilities?.styleAnalysis) {
          try {
            const response = await analyzeReference({
              imageBase64: reference.base64,
              mimeType: reference.mimeType,
              scriptHint: scriptHint === 'auto' ? 'auto' : scriptHint,
            });
            style = {
              dna: normalizeStyleDna(response.styleDna),
              meta: {
                engine: 'gemini',
                model: response.meta.model,
                elapsedMs: response.meta.elapsedMs,
                sourceName: reference.name,
              },
            };
          } catch (error) {
            const message =
              error instanceof ApiError ? error.message : 'The Gemini analyst was unreachable.';
            style = await runLocal(message);
            notify({
              tone: 'warning',
              title: 'Fell back to the local analyser',
              message: `${message} Your poster will still render — measurements come from the pixels instead of the model.`,
              code: 'ANALYSIS_FAILED',
            });
          }
        } else {
          style = await runLocal();
        }

        dispatch({ type: 'analysis/success', style });

        // If the analyst identified an Indic script and the composer is still
        // empty, move the language selector to match. Never override typing.
        const detected = style.dna.detectedScript;
        if (!state.text.trim()) {
          const match = LANGUAGES.find((language) => language.script === detected);
          if (match && match.id !== state.language) {
            dispatch({ type: 'language/set', language: match.id });
            notify({
              tone: 'info',
              title: `Switched to ${match.label}`,
              message: `The reference reads as ${detected}, so the composer is ready for ${match.endonym}.`,
              ttl: 5000,
            });
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown analysis failure.';
        dispatch({ type: 'analysis/fail', error: message });
        notify({
          tone: 'error',
          title: 'Could not read that reference',
          message,
          code: 'ANALYSIS_FAILED',
        });
      }
    },
    [dispatch, notify, state.capabilities, state.language, state.text],
  );

  const accept = useCallback(
    async (file: File | null | undefined) => {
      if (!file) return;

      if (!ACCEPTED_TYPES.includes(file.type)) {
        notify({
          tone: 'error',
          title: 'Unsupported file type',
          message: `${file.name || 'That file'} is ${file.type || 'an unknown type'}. Upload a JPG, PNG or WEBP.`,
          code: 'UNSUPPORTED_IMAGE_TYPE',
        });
        return;
      }
      if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
        notify({
          tone: 'error',
          title: 'That image is too large',
          message: `${(file.size / (1024 * 1024)).toFixed(1)}MB exceeds the ${MAX_UPLOAD_MB}MB limit. Export a smaller version and try again.`,
          code: 'IMAGE_TOO_LARGE',
        });
        return;
      }

      try {
        const [dimensions, base64] = await Promise.all([measureImage(file), readBase64(file)]);
        if (state.reference) URL.revokeObjectURL(state.reference.objectUrl);
        artifacts.referencePixels = null;

        const reference: ReferenceImage = {
          name: file.name || 'reference',
          mimeType: file.type,
          sizeBytes: file.size,
          width: dimensions.width,
          height: dimensions.height,
          objectUrl: URL.createObjectURL(file),
          base64,
        };

        // Decode once, up front: both the analyser and any re-analysis reuse it.
        artifacts.referencePixels = await imageDataFromBlob(file);

        dispatch({ type: 'reference/set', reference });
        await analyze(reference, state.analysis.scriptHint);
      } catch (error) {
        notify({
          tone: 'error',
          title: 'Could not open that image',
          message:
            error instanceof Error
              ? error.message
              : 'The browser could not decode the file. Try re-saving it as PNG.',
          code: 'UNSUPPORTED_IMAGE_TYPE',
        });
      }
    },
    [analyze, dispatch, notify, state.analysis.scriptHint, state.reference],
  );

  const clear = useCallback(() => {
    if (state.reference) URL.revokeObjectURL(state.reference.objectUrl);
    artifacts.referencePixels = null;
    resetArtifacts();
    dispatch({ type: 'reference/clear' });
  }, [dispatch, state.reference]);

  const reanalyze = useCallback(
    (hint: DetectedScript | 'auto') => {
      dispatch({ type: 'reference/scriptHint', hint });
      if (state.reference) void analyze(state.reference, hint);
    },
    [analyze, dispatch, state.reference],
  );

  return { accept, clear, reanalyze };
}
