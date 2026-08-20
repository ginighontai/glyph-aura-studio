import type { ChangeEvent } from 'react';
import { describeOutput, describeRatio, resolveCanvasSize, MAX_CUSTOM_EDGE, MIN_CUSTOM_EDGE } from '@/lib/render/aspect';
import { useStudio } from '@/state/store';
import { ASPECT_PRESETS, ENGINES, GENERATION_MODES } from '@/types/project';
import { GenerateButton } from './GenerateButton';
import { ProgressStages } from './ProgressStages';
import { Chip, Icon, Panel, Segmented } from './ui';

/** Miniature of the output shape, drawn to the real ratio. */
function RatioShape({ width, height }: { width: number; height: number }) {
  const scale = 30 / Math.max(width, height);
  return (
    <span className="ga-aspect__shape" aria-hidden="true">
      <span style={{ width: Math.max(6, width * scale), height: Math.max(6, height * scale) }} />
    </span>
  );
}

export function FormatPanel() {
  const { state, dispatch } = useStudio();
  const size = resolveCanvasSize(state.aspect, state.customSize);

  return (
    <Panel
      step="Step 4"
      title="Format & engine"
      icon="frame"
      id="format"
      subtitle="Pick the canvas, choose how expressive the result should be, then generate."
    >
      <div className="ga-field">
        <span className="ga-label">Aspect ratio</span>
        <div className="ga-aspect-grid" role="group" aria-label="Aspect ratio">
          {ASPECT_PRESETS.map((preset) => (
            <button
              type="button"
              key={preset.id}
              className="ga-aspect"
              aria-pressed={state.aspect === preset.id}
              onClick={() => dispatch({ type: 'aspect/set', aspect: preset.id })}
            >
              <RatioShape width={preset.width} height={preset.height} />
              <span className="ga-aspect__label">{preset.label}</span>
              <span className="ga-aspect__hint">{preset.hint}</span>
            </button>
          ))}
        </div>
      </div>

      {state.aspect === 'custom' ? (
        <div className="ga-row" style={{ gap: 10, alignItems: 'flex-end' }}>
          <div className="ga-field ga-grow">
            <label className="ga-label" htmlFor="ga-custom-w">
              Width (px)
            </label>
            <input
              id="ga-custom-w"
              className="ga-input"
              type="number"
              min={MIN_CUSTOM_EDGE}
              max={MAX_CUSTOM_EDGE}
              value={state.customSize.width}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                dispatch({
                  type: 'customSize/set',
                  width: Number(event.currentTarget.value) || MIN_CUSTOM_EDGE,
                  height: state.customSize.height,
                })
              }
            />
          </div>
          <div className="ga-field ga-grow">
            <label className="ga-label" htmlFor="ga-custom-h">
              Height (px)
            </label>
            <input
              id="ga-custom-h"
              className="ga-input"
              type="number"
              min={MIN_CUSTOM_EDGE}
              max={MAX_CUSTOM_EDGE}
              value={state.customSize.height}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                dispatch({
                  type: 'customSize/set',
                  width: state.customSize.width,
                  height: Number(event.currentTarget.value) || MIN_CUSTOM_EDGE,
                })
              }
            />
          </div>
        </div>
      ) : null}

      <div className="ga-row">
        <Chip>{describeRatio(size)}</Chip>
        <Chip>{describeOutput(size, state.aspect)}</Chip>
      </div>

      <div className="ga-field">
        <span className="ga-label">Generation mode</span>
        <div className="ga-mode-list" role="group" aria-label="Generation mode">
          {GENERATION_MODES.map((mode) => (
            <button
              type="button"
              key={mode.id}
              className="ga-mode"
              aria-pressed={state.mode === mode.id}
              onClick={() => dispatch({ type: 'mode/set', mode: mode.id })}
            >
              <span className="ga-mode__radio" aria-hidden="true" />
              <span className="ga-mode__copy">
                <span className="ga-mode__name">{mode.label}</span>
                <span className="ga-caption">{mode.blurb}</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="ga-field">
        <span className="ga-label">Render engine</span>
        <Segmented
          label="Render engine"
          value={state.engine}
          onChange={(value) => dispatch({ type: 'engine/set', engine: value })}
          options={ENGINES.map((engine) => ({
            value: engine.id,
            label: engine.label,
            disabled: engine.needsGemini && !state.capabilities?.imageGeneration,
            title:
              engine.needsGemini && !state.capabilities?.imageGeneration
                ? 'Add GEMINI_API_KEY and GEMINI_IMAGE_MODEL on the server to enable this'
                : engine.blurb,
          }))}
        />
        <p className="ga-caption">
          {ENGINES.find((engine) => engine.id === state.engine)?.blurb}
          {state.engine === 'ai-image' && !state.capabilities?.imageGeneration ? (
            <>
              {' '}
              <Icon name="alert" size={12} /> Not configured on this server.
            </>
          ) : null}
        </p>
      </div>

      <div className="ga-divider" />
      <GenerateButton />
      <ProgressStages />
    </Panel>
  );
}
