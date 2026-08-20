import { useId } from 'react';
import { generateReadiness, useStudio } from '@/state/store';
import { useGeneration } from '@/state/useGeneration';
import { Icon } from './ui';

export function GenerateButton({ compact = false }: { compact?: boolean }) {
  const { state } = useStudio();
  const { generate } = useGeneration();
  const readiness = generateReadiness(state);
  const hintId = useId();

  return (
    <div className="ga-stack" style={{ gap: 6 }}>
      <button
        type="button"
        className={`ga-btn ga-btn--primary ga-btn--large ga-btn--block${
          readiness.ready ? ' ga-btn--shimmer' : ''
        }`}
        disabled={!readiness.ready}
        aria-describedby={hintId}
        onClick={() => void generate()}
      >
        {state.generating ? (
          <>
            <Icon name="refresh" size={17} />
            Generating…
          </>
        ) : (
          <>
            <Icon name="wand" size={17} />
            {state.output ? 'Generate again' : 'Generate poster'}
          </>
        )}
      </button>
      {!compact || !readiness.ready ? (
        <p className="ga-caption" id={hintId} style={{ textAlign: 'center' }}>
          {readiness.reason ??
            (state.engine === 'vector'
              ? 'The vector engine runs entirely in your browser — no API key needed.'
              : 'Gemini will render the poster, then OCR checks your text survived.')}
        </p>
      ) : null}
    </div>
  );
}
