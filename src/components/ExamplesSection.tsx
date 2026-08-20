import { STYLE_PRESETS } from '@/lib/presets/examples';
import { selectFont } from '@/lib/render/fonts';
import { activeScript, useStudio } from '@/state/store';
import { Chip, Icon } from './ui';

export function ExamplesSection() {
  const { state, dispatch } = useStudio();
  const script = activeScript(state);

  return (
    <section className="ga-section" id="examples" aria-labelledby="examples-heading">
      <div className="ga-section__head">
        <span className="ga-label">Examples</span>
        <h2 className="ga-title" id="examples-heading">
          Six hands to start from
        </h2>
        <p className="ga-subtitle">
          Each card is a complete Style DNA — the same object the analyser produces from an uploaded
          image. Load one to see the whole pipeline work, or to blend a known-good style with your own
          text while you wait for a reference.
        </p>
      </div>

      <div className="ga-cards">
        {STYLE_PRESETS.map((preset) => {
          const font = selectFont(preset.dna, script).font;
          const background =
            preset.dna.colorProfile.backgroundColors.length > 1
              ? `linear-gradient(150deg, ${preset.dna.colorProfile.backgroundColors.join(', ')})`
              : preset.dna.colorProfile.backgroundColors[0];

          return (
            <button
              type="button"
              key={preset.id}
              className="ga-example"
              aria-pressed={state.activePresetId === preset.id}
              onClick={() => {
                dispatch({
                  type: 'preset/apply',
                  presetId: preset.id,
                  style: {
                    dna: preset.dna,
                    meta: { engine: 'preset', sourceName: preset.name },
                  },
                  text: preset.sampleText[script],
                  mode: preset.suggestedMode,
                });
                document.getElementById('studio')?.scrollIntoView({ behavior: 'smooth' });
              }}
            >
              <span className="ga-example__art" style={{ background }}>
                <span
                  className="ga-example__sample"
                  style={{
                    fontFamily: `'${font.family}', serif`,
                    fontWeight: Math.min(
                      Math.max(preset.dna.renderHints.weight, font.weightMin),
                      font.weightMax,
                    ),
                    color: preset.dna.colorProfile.primaryColors[0],
                    fontStyle: 'normal',
                    transform:
                      Math.abs(preset.dna.renderHints.slantDegrees) > 2
                        ? `skewX(${-preset.dna.renderHints.slantDegrees}deg)`
                        : undefined,
                    textShadow:
                      preset.dna.renderHints.glowRadiusEm > 0.05
                        ? `0 0 18px ${preset.dna.colorProfile.primaryColors[0]}`
                        : preset.dna.renderHints.shadowOffsetEm > 0.01
                          ? `2px 3px 4px ${preset.dna.colorProfile.shadowColor === 'none' ? 'rgba(0,0,0,.3)' : preset.dna.colorProfile.shadowColor}`
                          : undefined,
                  }}
                >
                  {preset.sampleText[script]}
                </span>
              </span>
              <span className="ga-example__copy">
                <span className="ga-row" style={{ justifyContent: 'space-between' }}>
                  <strong style={{ fontSize: '0.95rem' }}>{preset.name}</strong>
                  {state.activePresetId === preset.id ? (
                    <Chip tone="accent" dot>
                      loaded
                    </Chip>
                  ) : (
                    <Icon name="chevron" size={14} />
                  )}
                </span>
                <span className="ga-caption">{preset.blurb}</span>
                <span className="ga-row" style={{ marginTop: 4 }}>
                  <span className="ga-example__swatches">
                    {preset.swatches.slice(0, 4).map((hex, index) => (
                      <span
                        className="ga-example__swatch"
                        key={`${hex}-${index}`}
                        style={{ background: hex }}
                      />
                    ))}
                  </span>
                  <span className="ga-caption">{font.family}</span>
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
