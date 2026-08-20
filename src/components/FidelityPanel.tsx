import { useMemo } from 'react';
import { scoreFonts } from '@/lib/render/fonts';
import { activeScript, useStudio } from '@/state/store';
import { DEFAULT_FIDELITY, FIDELITY_CONTROLS } from '@/types/project';
import { Chip, Disclosure, Icon, Panel, Slider } from './ui';

const SAMPLES: Record<string, string> = {
  Latin: 'Handgloves',
  Bengali: 'বাংলা লিপি',
  Devanagari: 'देवनागरी',
};

export function FidelityPanel() {
  const { state, dispatch } = useStudio();
  const script = activeScript(state);
  const style = state.analysis.style;

  const ranked = useMemo(
    () => (style ? scoreFonts(style.dna, script).slice(0, 10) : []),
    [script, style],
  );

  const isDirty =
    FIDELITY_CONTROLS.some((control) => state.fidelity[control.key] !== DEFAULT_FIDELITY[control.key]) ||
    state.fontOverride !== null;

  return (
    <Panel
      step="Refine"
      title="Fidelity controls"
      icon="sliders"
      id="fidelity"
      subtitle={
        state.engine === 'vector'
          ? 'Adjustments re-render the poster automatically.'
          : 'Adjustments are folded into the prompt on the next generate.'
      }
      actions={
        <button
          type="button"
          className="ga-btn ga-btn--quiet"
          onClick={() => dispatch({ type: 'fidelity/reset' })}
          disabled={!isDirty}
        >
          <Icon name="refresh" size={14} />
          Reset
        </button>
      }
    >
      <div className="ga-stack" style={{ gap: 18 }}>
        {FIDELITY_CONTROLS.map((control) => (
          <Slider
            key={control.key}
            label={control.label}
            value={state.fidelity[control.key]}
            lowLabel={control.lowLabel}
            highLabel={control.highLabel}
            help={control.help}
            onChange={(value) => dispatch({ type: 'fidelity/set', key: control.key, value })}
          />
        ))}
      </div>

      <Disclosure
        summary="Typeface override"
        badge={
          state.fontOverride ? <Chip tone="accent">manual</Chip> : <Chip>automatic</Chip>
        }
      >
        <div className="ga-stack">
          <p className="ga-caption">
            The engine picks the bundled face that best matches the reference. Override it when you
            know better — the analysed weight, slant, contrast and effects still apply.
          </p>
          <div className="ga-font-list">
            <button
              type="button"
              className="ga-font-option"
              aria-pressed={state.fontOverride === null}
              onClick={() => dispatch({ type: 'font/override', fontId: null })}
            >
              <span className="ga-mode__copy">
                <span className="ga-mode__name">Automatic</span>
                <span className="ga-font-option__name">Chosen from the Style DNA</span>
              </span>
              {state.fontOverride === null ? <Icon name="check" size={15} /> : null}
            </button>
            {ranked.map((entry) => (
              <button
                type="button"
                key={entry.font.id}
                className="ga-font-option"
                aria-pressed={state.fontOverride === entry.font.id}
                onClick={() => dispatch({ type: 'font/override', fontId: entry.font.id })}
                title={entry.font.note}
              >
                <span className="ga-mode__copy">
                  <span
                    className="ga-font-option__sample"
                    style={{ fontFamily: `'${entry.font.family}', serif` }}
                  >
                    {SAMPLES[script] ?? 'Handgloves'}
                  </span>
                  <span className="ga-font-option__name">
                    {entry.font.family} · {entry.font.category} · score {Math.round(entry.score)}
                  </span>
                </span>
                {state.fontOverride === entry.font.id ? <Icon name="check" size={15} /> : null}
              </button>
            ))}
          </div>
          {!ranked.length ? (
            <p className="ga-caption">Load a style first and the ranked faces appear here.</p>
          ) : null}
        </div>
      </Disclosure>
    </Panel>
  );
}
