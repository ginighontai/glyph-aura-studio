import { clamp } from '@/types/styleDna';
import { useStudio } from '@/state/store';
import { useGeneration } from '@/state/useGeneration';
import { Chip, EmptyState, Icon, Panel } from './ui';

const VERDICT_ICON: Record<string, string> = {
  guaranteed: 'check',
  verified: 'check',
  mismatch: 'alert',
  unavailable: 'info',
  checking: 'refresh',
};

export function OutputPanel() {
  const { state, dispatch } = useStudio();
  const { generate } = useGeneration();
  const output = state.output;
  const report = state.fidelityReport;

  const setZoom = (value: number) => dispatch({ type: 'zoom/set', zoom: clamp(value, 0.25, 6) });

  return (
    <Panel
      step="Step 5"
      title="Output"
      icon="eye"
      id="output"
      subtitle={
        output
          ? `${output.width} × ${output.height}px · ${output.engine === 'vector' ? 'vector engine' : 'AI image engine'}`
          : 'Your poster appears here.'
      }
      actions={
        output ? (
          <div className="ga-zoom">
            <button
              type="button"
              className="ga-icon-btn"
              aria-label="Zoom out"
              onClick={() => setZoom(state.zoom / 1.35)}
            >
              <Icon name="minus" size={15} />
            </button>
            <span className="ga-zoom__value">{Math.round(state.zoom * 100)}%</span>
            <button
              type="button"
              className="ga-icon-btn"
              aria-label="Zoom in"
              onClick={() => setZoom(state.zoom * 1.35)}
            >
              <Icon name="plus" size={15} />
            </button>
            <button
              type="button"
              className="ga-btn ga-btn--quiet"
              onClick={() => setZoom(1)}
              disabled={state.zoom === 1}
            >
              Fit
            </button>
          </div>
        ) : null
      }
    >
      <div
        className={output ? 'ga-output__stage' : 'ga-output__stage ga-output__stage--empty'}
        aria-busy={state.generating}
      >
        {output ? (
          <img
            key={output.id}
            src={output.url}
            className={state.zoom > 1 ? 'ga-output__art ga-output__art--zoomed' : 'ga-output__art'}
            style={state.zoom !== 1 ? { width: `${state.zoom * 100}%` } : undefined}
            alt={`Generated poster reading “${output.text.replace(/\n/g, ' ')}” in ${output.script} script${
              output.fontFamily ? `, set in ${output.fontFamily}` : ''
            }`}
          />
        ) : state.generating ? (
          <EmptyState icon="wand" title="Rendering…" message="Laying out your text in the reference hand." />
        ) : (
          <EmptyState
            icon="image"
            title="Nothing generated yet"
            message="Load a style, type your text, then press Generate. The poster and its export options will appear here."
          />
        )}
      </div>

      {output ? (
        <div className="ga-row">
          <Chip tone="accent">{output.engine === 'vector' ? 'Vector engine' : output.modelUsed ?? 'AI image'}</Chip>
          {output.fontFamily ? <Chip>{output.fontFamily}</Chip> : null}
          <Chip>{output.script}</Chip>
          {output.transparent ? <Chip tone="success">transparent</Chip> : null}
          <Chip>{(output.elapsedMs / 1000).toFixed(1)}s</Chip>
        </div>
      ) : null}

      {report ? (
        <div className={`ga-verdict ga-verdict--${report.status}`} role="status">
          <Icon name={VERDICT_ICON[report.status] ?? 'info'} size={20} className="ga-verdict__icon" />
          <div className="ga-verdict__body">
            <strong style={{ fontSize: '0.88rem' }}>{report.message}</strong>
            {report.detail ? <span className="ga-verdict__detail">{report.detail}</span> : null}
            {report.status === 'mismatch' ? (
              <div className="ga-row">
                <button
                  type="button"
                  className="ga-btn ga-btn--primary"
                  disabled={state.generating}
                  onClick={() => void generate({ strict: true })}
                >
                  <Icon name="refresh" size={14} />
                  Regenerate with stricter text fidelity
                </button>
                <button
                  type="button"
                  className="ga-btn ga-btn--outline"
                  onClick={() => dispatch({ type: 'engine/set', engine: 'vector' })}
                >
                  Switch to the vector engine
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {state.renderNotes.length ? (
        <ul className="ga-warning-list">
          {state.renderNotes.map((note, index) => (
            <li key={index}>
              <Icon name="info" size={14} />
              <span>{note}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </Panel>
  );
}
