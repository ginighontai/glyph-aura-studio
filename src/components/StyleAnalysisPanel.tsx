import { useMemo } from 'react';
import { describeColor } from '@/lib/analysis/color';
import { selectFont } from '@/lib/render/fonts';
import { activeScript, useStudio } from '@/state/store';
import { clamp, type StyleDna } from '@/types/styleDna';
import { Chip, CopyButton, Disclosure, EmptyState, Icon, Meter, Panel } from './ui';

function Swatches({ label, colors }: { label: string; colors: string[] }) {
  if (!colors.length) return null;
  return (
    <div className="ga-field">
      <span className="ga-label">{label}</span>
      <div className="ga-swatches">
        {colors.slice(0, 6).map((hex, index) => (
          <div className="ga-swatch" key={`${hex}-${index}`} title={`${hex} — ${describeColor(hex)}`}>
            <span className="ga-swatch__chip" style={{ background: hex }} />
            <span className="ga-swatch__hex">{hex.replace('#', '')}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProfileRows({ rows }: { rows: Array<[string, string]> }) {
  return (
    <div className="ga-profile">
      {rows.map(([key, value]) => (
        <div className="ga-profile__row" key={key}>
          <span className="ga-profile__key">{key}</span>
          <span className="ga-profile__value">{value}</span>
        </div>
      ))}
    </div>
  );
}

const weightWord = (weight: number): string => {
  if (weight <= 250) return 'Thin';
  if (weight <= 350) return 'Light';
  if (weight <= 450) return 'Regular';
  if (weight <= 550) return 'Medium';
  if (weight <= 650) return 'Semibold';
  if (weight <= 780) return 'Bold';
  if (weight <= 860) return 'Extrabold';
  return 'Black';
};

export function StyleAnalysisPanel() {
  const { state, dispatch } = useStudio();
  const script = activeScript(state);
  const style = state.analysis.style;

  const selection = useMemo(
    () => (style ? selectFont(style.dna, script, state.fontOverride ?? undefined) : null),
    [script, state.fontOverride, style],
  );

  if (!style) {
    return (
      <Panel step="Step 2" title="Style analysis" icon="palette" id="analysis">
        <EmptyState
          icon="wand"
          title="No style extracted yet"
          message="Upload a reference or load an example and the analyser will measure its strokes, palette, effects and composition here."
        />
      </Panel>
    );
  }

  const dna: StyleDna = style.dna;
  const hints = dna.renderHints;
  const engineLabel =
    style.meta.engine === 'gemini'
      ? `Gemini · ${style.meta.model ?? 'multimodal'}`
      : style.meta.engine === 'preset'
        ? 'Example preset'
        : 'Local analyser';

  return (
    <Panel
      step="Step 2"
      title="Style analysis"
      icon="palette"
      collapsible
      id="analysis"
      subtitle={`Style DNA extracted by the ${style.meta.engine === 'gemini' ? 'Gemini analyst' : style.meta.engine === 'preset' ? 'bundled preset' : 'in-browser analyser'}.`}
      actions={<Chip tone={style.meta.engine === 'gemini' ? 'accent' : 'default'}>{engineLabel}</Chip>}
    >
      <div className="ga-row">
        <Chip tone="accent">{dna.typographyCategory}</Chip>
        <Chip>{hints.fontCategory}</Chip>
        <Chip>{weightWord(hints.weight)} · {hints.weight}</Chip>
        {Math.abs(hints.slantDegrees) > 1.5 ? (
          <Chip>{`${hints.slantDegrees > 0 ? '+' : ''}${hints.slantDegrees.toFixed(0)}° slant`}</Chip>
        ) : (
          <Chip>upright</Chip>
        )}
        <Chip>{hints.alignment}</Chip>
        {style.meta.elapsedMs ? <Chip>{(style.meta.elapsedMs / 1000).toFixed(1)}s</Chip> : null}
      </div>

      <Meter
        label="Analysis confidence"
        value={dna.confidenceScore}
        display={`${Math.round(dna.confidenceScore * 100)}%`}
      />

      {dna.detectedReferenceText ? (
        <div className="ga-compose__preview">
          <span className="ga-label">Text read in the reference</span>
          <p className="ga-native-text" style={{ fontSize: '1.15rem' }}>
            {dna.detectedReferenceText}
          </p>
          <div className="ga-row">
            <button
              type="button"
              className="ga-btn ga-btn--quiet"
              onClick={() =>
                dispatch({ type: 'text/set', value: dna.detectedReferenceText, byHand: true })
              }
            >
              <Icon name="type" size={14} />
              Use as my text
            </button>
            <span className="ga-caption">The poster will use your own text unless you do this.</span>
          </div>
        </div>
      ) : null}

      <Swatches label="Lettering palette" colors={dna.colorProfile.primaryColors} />
      <Swatches label="Ground" colors={dna.colorProfile.backgroundColors} />

      <div className="ga-stack">
        <Meter
          label="Stroke weight"
          value={clamp((hints.weight - 100) / 800, 0, 1)}
          display={dna.strokeProfile.averageStrokeWidth.split('—')[0].trim()}
        />
        <Meter
          label="Thick / thin contrast"
          value={clamp((hints.strokeContrastRatio - 1) / 7, 0, 1)}
          display={`${hints.strokeContrastRatio.toFixed(1)} : 1`}
        />
        <Meter
          label="Edge roughness"
          value={hints.edgeRoughness}
          display={hints.edgeRoughness < 0.05 ? 'crisp' : `${Math.round(hints.edgeRoughness * 100)}%`}
        />
        <Meter
          label="Substrate texture"
          value={hints.textureIntensity}
          display={hints.textureIntensity < 0.05 ? 'none' : `${Math.round(hints.textureIntensity * 100)}%`}
        />
        <Meter
          label="Ornament"
          value={hints.ornamentation}
          display={hints.ornamentation < 0.05 ? 'none' : `${Math.round(hints.ornamentation * 100)}%`}
        />
      </div>

      {selection ? (
        <div className="ga-compose__preview">
          <span className="ga-label">Matched typeface for {script}</span>
          <p
            style={{
              fontFamily: `'${selection.font.family}', serif`,
              fontWeight: Math.min(Math.max(hints.weight, selection.font.weightMin), selection.font.weightMax),
              fontSize: '1.6rem',
              lineHeight: 1.3,
            }}
          >
            {script === 'Bengali' ? 'বাংলা লিপি' : script === 'Devanagari' ? 'देवनागरी लिपि' : 'Handgloves 123'}
          </p>
          <span className="ga-caption">
            <strong>{selection.font.family}</strong> — {selection.font.note}
          </span>
          {selection.reasons.length ? (
            <span className="ga-caption">Why: {selection.reasons.slice(0, 3).join('; ')}.</span>
          ) : null}
        </div>
      ) : null}

      {dna.userWarnings.length ? (
        <ul className="ga-warning-list">
          {dna.userWarnings.map((warning, index) => (
            <li key={index}>
              <Icon name="alert" size={14} />
              <span>{warning}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {style.meta.fallbackReason ? (
        <p className="ga-caption">
          <Icon name="info" size={13} /> Gemini was unavailable ({style.meta.fallbackReason}) — these
          numbers come from the local analyser.
        </p>
      ) : null}

      <Disclosure summary="Stroke & form profile">
        <ProfileRows
          rows={[
            ['Stroke width', dna.strokeProfile.averageStrokeWidth],
            ['Contrast', dna.strokeProfile.strokeContrast],
            ['Pressure', dna.strokeProfile.pressureVariation],
            ['Edges', dna.strokeProfile.edgeQuality],
            ['Tool', dna.strokeProfile.brushTexture],
            ['Proportions', dna.formProfile.xHeightOrScriptScale],
            ['Curves', dna.formProfile.curves],
            ['Terminals', dna.formProfile.terminals],
            ['Ligatures', dna.formProfile.ligatures],
            ['Flourishes', dna.formProfile.flourishes],
            ['Slant', dna.formProfile.slant],
            ['Baseline', dna.formProfile.baseline],
          ]}
        />
      </Disclosure>

      <Disclosure summary="Colour & effects">
        <ProfileRows
          rows={[
            ['Gradient', dna.colorProfile.gradientDescription],
            ['Outline', dna.colorProfile.outlineColor],
            ['Shadow', dna.effectsProfile.shadow],
            ['Glow', dna.effectsProfile.glow],
            ['Emboss', dna.effectsProfile.emboss],
            ['Ink bleed', dna.effectsProfile.inkBleed],
            ['Substrate', dna.effectsProfile.paperTexture],
            ['Grain', dna.effectsProfile.grain],
            ['Lighting', dna.effectsProfile.lighting],
          ]}
        />
      </Disclosure>

      <Disclosure summary="Composition">
        <ProfileRows
          rows={[
            ['Layout', dna.compositionProfile.layout],
            ['Alignment', dna.compositionProfile.alignment],
            ['Margins', dna.compositionProfile.margins],
            ['Hierarchy', dna.compositionProfile.textHierarchy],
            ['Decoration', dna.compositionProfile.decorativeElements],
          ]}
        />
      </Disclosure>

      <Disclosure summary="Advanced — Style DNA JSON" badge={<CopyButton value={JSON.stringify(dna, null, 2)} />}>
        <pre className="ga-json" tabIndex={0} aria-label="Style DNA as JSON">
          {JSON.stringify(dna, null, 2)}
        </pre>
      </Disclosure>
    </Panel>
  );
}
