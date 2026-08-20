import {
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent,
} from 'react';
import { formatBytes } from '@/lib/export/exporters';
import { SCRIPT_LABELS } from '@/lib/script/detect';
import { presetById } from '@/lib/presets/examples';
import { useStudio } from '@/state/store';
import { ACCEPTED_TYPES, MAX_UPLOAD_MB, useReference } from '@/state/useReference';
import type { DetectedScript } from '@/types/styleDna';
import { Chip, Icon, Panel, Segmented } from './ui';

const SCRIPT_OPTIONS: Array<{ value: DetectedScript | 'auto'; label: string }> = [
  { value: 'auto', label: 'Auto' },
  { value: 'Latin', label: 'Latin' },
  { value: 'Bengali', label: 'বাংলা' },
  { value: 'Devanagari', label: 'हिन्दी' },
];

export function ReferencePanel() {
  const { state } = useStudio();
  const { accept, clear, reanalyze } = useReference();
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const preset = state.activePresetId ? presetById(state.activePresetId) : undefined;
  const analysing = state.analysis.status === 'running';

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer?.files?.[0];
    void accept(file);
  };

  return (
    <Panel
      step="Step 1"
      title="Reference"
      icon="image"
      subtitle="Upload the lettering whose style you want to borrow — or start from an example."
      id="reference"
      actions={
        state.reference ? (
          <>
            <button
              type="button"
              className="ga-btn ga-btn--quiet"
              onClick={() => inputRef.current?.click()}
            >
              <Icon name="refresh" size={14} />
              Replace
            </button>
            <button type="button" className="ga-btn ga-btn--quiet" onClick={clear}>
              <Icon name="close" size={14} />
              Remove
            </button>
          </>
        ) : null
      }
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_TYPES.join(',')}
        className="ga-sr-only"
        onChange={(event: ChangeEvent<HTMLInputElement>) => {
          void accept(event.currentTarget.files?.[0]);
          event.currentTarget.value = '';
        }}
      />

      {state.reference ? (
        <div className="ga-reference">
          <figure className="ga-reference__frame">
            <img
              src={state.reference.objectUrl}
              alt={`Reference lettering: ${state.reference.name}`}
              width={state.reference.width}
              height={state.reference.height}
            />
          </figure>
          <div className="ga-reference__meta">
            <div className="ga-meta-cell">
              <span className="ga-label">File</span>
              <span className="ga-meta-cell__value" title={state.reference.name}>
                {state.reference.name}
              </span>
            </div>
            <div className="ga-meta-cell">
              <span className="ga-label">Pixels</span>
              <span className="ga-meta-cell__value">
                {state.reference.width} × {state.reference.height}
              </span>
            </div>
            <div className="ga-meta-cell">
              <span className="ga-label">Size</span>
              <span className="ga-meta-cell__value">{formatBytes(state.reference.sizeBytes)}</span>
            </div>
            <div className="ga-meta-cell">
              <span className="ga-label">Type</span>
              <span className="ga-meta-cell__value">
                {state.reference.mimeType.replace('image/', '').toUpperCase()}
              </span>
            </div>
          </div>
        </div>
      ) : preset ? (
        <div className="ga-reference">
          <figure
            className="ga-reference__frame"
            style={{
              background:
                preset.dna.colorProfile.backgroundColors.length > 1
                  ? `linear-gradient(140deg, ${preset.dna.colorProfile.backgroundColors.join(', ')})`
                  : preset.dna.colorProfile.backgroundColors[0],
            }}
          >
            <span
              aria-hidden="true"
              style={{
                color: preset.dna.colorProfile.primaryColors[0],
                fontSize: '2rem',
                fontWeight: 600,
                letterSpacing: '-0.02em',
                padding: '0 12px',
                textAlign: 'center',
              }}
            >
              {preset.name}
            </span>
          </figure>
          <div className="ga-row">
            <Chip tone="accent" dot>
              Example style loaded
            </Chip>
            <button
              type="button"
              className="ga-btn ga-btn--quiet"
              onClick={() => inputRef.current?.click()}
            >
              <Icon name="upload" size={14} />
              Upload a reference instead
            </button>
          </div>
          <p className="ga-caption">{preset.blurb}</p>
        </div>
      ) : (
        <div
          className={dragging ? 'ga-drop ga-drop--active' : 'ga-drop'}
          onDragOver={(event: DragEvent<HTMLDivElement>) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
            if (event.key === 'Enter' || event.key === ' ') inputRef.current?.click();
          }}
          role="button"
          tabIndex={0}
          aria-label="Upload a reference image"
        >
          <Icon name="upload" size={40} className="ga-drop__icon" strokeWidth={1.3} />
          <p style={{ fontWeight: 600 }}>Drop a reference image</p>
          <p className="ga-caption">
            JPG, PNG or WEBP up to {MAX_UPLOAD_MB}MB. Posters, packaging, signage, a photo of
            handwriting — anything with lettering in it.
          </p>
        </div>
      )}

      {(state.reference || preset) && (
        <div className="ga-field">
          <span className="ga-label">Reference script</span>
          <Segmented
            label="Reference script"
            value={state.analysis.scriptHint}
            onChange={(value) => reanalyze(value)}
            options={SCRIPT_OPTIONS.map((option) => ({
              ...option,
              disabled: !state.reference || analysing,
            }))}
          />
          <p className="ga-caption">
            {state.analysis.status === 'ready' && state.analysis.style
              ? `Detected: ${SCRIPT_LABELS[state.analysis.style.dna.detectedScript]}`
              : 'Set this by hand if the analyser guesses wrong.'}
          </p>
        </div>
      )}

      {analysing ? (
        <div className="ga-stack" aria-live="polite">
          <div className="ga-row">
            <span className="ga-chip ga-chip--accent">
              <span className="ga-dot" /> Analysing the reference
            </span>
          </div>
          <div className="ga-skeleton" style={{ height: 12, width: '76%' }} />
          <div className="ga-skeleton" style={{ height: 12, width: '54%' }} />
          <div className="ga-skeleton" style={{ height: 40 }} />
        </div>
      ) : null}

      {state.analysis.status === 'failed' ? (
        <div className="ga-verdict ga-verdict--mismatch">
          <Icon name="alert" size={20} className="ga-verdict__icon" />
          <div className="ga-verdict__body">
            <strong style={{ fontSize: '0.88rem' }}>Analysis failed</strong>
            <span className="ga-verdict__detail">{state.analysis.error}</span>
            {state.reference ? (
              <button
                type="button"
                className="ga-btn ga-btn--outline"
                style={{ alignSelf: 'flex-start' }}
                onClick={() => reanalyze(state.analysis.scriptHint)}
              >
                <Icon name="refresh" size={14} />
                Try again
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </Panel>
  );
}
