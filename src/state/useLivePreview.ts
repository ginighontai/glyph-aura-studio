import { useEffect, useMemo, useRef } from 'react';
import { useStudio } from './store';
import { useGeneration } from './useGeneration';

/**
 * Live re-render.
 *
 * The vector engine draws in a few milliseconds, so once a poster exists it is
 * re-rendered whenever a control that affects the artwork changes — moving a
 * slider should show its effect, not just promise it. The AI engine is
 * deliberately excluded: those renders cost money and take seconds, so they stay
 * on the explicit Generate button.
 */
export function useLivePreview(): void {
  const { state } = useStudio();
  const { generate } = useGeneration();

  const generateRef = useRef(generate);
  generateRef.current = generate;

  const signature = useMemo(
    () =>
      JSON.stringify([
        state.fidelity,
        state.fontOverride,
        state.mode,
        state.transparent,
        state.aspect,
        state.customSize,
      ]),
    [
      state.aspect,
      state.customSize,
      state.fidelity,
      state.fontOverride,
      state.mode,
      state.transparent,
    ],
  );

  const applied = useRef(signature);

  useEffect(() => {
    if (!state.output || state.engine !== 'vector' || state.generating) return;
    if (signature === applied.current) return;
    const timer = setTimeout(() => {
      applied.current = signature;
      void generateRef.current();
    }, 420);
    return () => clearTimeout(timer);
  }, [signature, state.engine, state.generating, state.output]);
}
