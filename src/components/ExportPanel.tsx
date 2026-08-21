import { describeExport, isTransparentCapable } from '@/lib/export/exporters';
import { scaledSize } from '@/lib/render/aspect';
import { useStudio } from '@/state/store';
import { useExport } from '@/state/useExport';
import type { ExportFormat } from '@/types/project';
import { Chip, Disclosure, Icon, Panel, Segmented, Slider, Switch } from './ui';

const FORMATS: Array<{ value: ExportFormat; label: string; hint: string }> = [
  { value: 'png', label: 'PNG', hint: 'Lossless, keeps alpha' },
  { value: 'jpg', label: 'JPG', hint: 'Smaller, no alpha' },
  { value: 'svg', label: 'SVG', hint: 'Vector, live text' },
];

export function ExportPanel() {
  const { state, dispatch } = useStudio();
  const { run, busy } = useExport();
  const output = state.output;
  const settings = state.exportSettings;

  const target = output
    ? scaledSize({ width: output.width, height: output.height }, settings.format === 'svg' ? 1 : settings.scale)
    : null;

  return (
    <Panel
      step="Step 6"
      title="Export"
      icon="download"
      id="export"
      subtitle={
        output?.kind === 'raster'
          ? 'The AI engine returns a fixed-size bitmap, so scaling it up interpolates. Vector-engine output re-renders at full resolution instead.'
          : 'Re-rendered at full resolution on download — never an upscaled preview.'
      }
    >
      <div className="ga-field">
        <span className="ga-label">Format</span>
        <Segmented
          label="Export format"
          value={settings.format}
          onChange={(value) => dispatch({ type: 'export/set', patch: { format: value } })}
          options={FORMATS.map((format) => ({
            value: format.value,
            label: format.label,
            title: format.hint,
          }))}
        />
        <p className="ga-caption">{FORMATS.find((format) => format.value === settings.format)?.hint}</p>
      </div>

      <div className="ga-field">
        <span className="ga-label">Resolution</span>
        <Segmented
          label="Export scale"
          value={String(settings.scale)}
          onChange={(value) =>
            dispatch({ type: 'export/set', patch: { scale: Number(value) as 1 | 2 | 4 } })
          }
          options={[
            { value: '1', label: '1×' },
            { value: '2', label: '2×' },
            { value: '4', label: '4×' },
          ]}
        />
        {output && target ? (
          <div className="ga-export__summary">
            <span>
              <strong>{describeExport(output, settings)}</strong>
              {settings.format === 'svg' ? ' — resolution independent' : null}
            </span>
            {target.note ? <span>{target.note}</span> : null}
            {output.kind === 'raster' && settings.scale > 1 && settings.format !== 'svg' ? (
              <span>
                The AI engine returns a fixed-size bitmap, so this is an interpolated upscale. The
                vector engine redraws at any size.
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="ga-divider" />

      <div className="ga-stack">
        <Switch
          title="Transparent background"
          description={
            settings.format === 'jpg'
              ? 'JPG cannot store alpha — the artwork will be flattened onto white.'
              : 'Drops the ground and exports the lettering on alpha.'
          }
          checked={settings.transparent}
          disabled={!isTransparentCapable(settings.format)}
          onChange={(value) => dispatch({ type: 'transparent/set', value })}
        />
        <Switch
          title="Vectorize output"
          description="Switches the export to SVG. The vector engine writes real text and paths; AI renders are wrapped as an embedded bitmap."
          checked={settings.vectorize}
          onChange={(value) => dispatch({ type: 'vectorize/set', value })}
        />
        <Switch
          title="Typography only"
          description="Exports the lettering with no ground and no substrate texture — ready to place over your own artwork."
          checked={settings.typographyOnly}
          onChange={(value) => dispatch({ type: 'export/set', patch: { typographyOnly: value } })}
        />
        <Switch
          title="Preserve effects"
          description="Keeps shadows, glow and ink bleed when the background is removed. Turn off for a hard-edged cut-out."
          checked={settings.preserveEffects}
          onChange={(value) => dispatch({ type: 'export/set', patch: { preserveEffects: value } })}
        />
      </div>

      <Disclosure summary="Format options">
        <div className="ga-stack">
          <Switch
            title="Embed the font in SVG"
            description="Makes the vector file self-contained (adds roughly 100–900 KB). Turn off if your tool already has the face installed."
            checked={settings.embedFontInSvg}
            onChange={(value) => dispatch({ type: 'export/set', patch: { embedFontInSvg: value } })}
          />
          <Slider
            label="JPG quality"
            value={Math.round(settings.jpgQuality * 100)}
            min={50}
            max={100}
            suffix="%"
            lowLabel="Smaller file"
            highLabel="Best quality"
            onChange={(value) => dispatch({ type: 'export/set', patch: { jpgQuality: value / 100 } })}
          />
        </div>
      </Disclosure>

      <div className="ga-export__actions">
        <button
          type="button"
          className="ga-btn ga-btn--primary"
          disabled={!output || busy !== null}
          onClick={() => void run()}
        >
          <Icon name="download" size={15} />
          {busy === settings.format ? 'Preparing…' : `Download ${settings.format.toUpperCase()}`}
        </button>
        {FORMATS.filter((format) => format.value !== settings.format).map((format) => (
          <button
            type="button"
            key={format.value}
            className="ga-btn ga-btn--outline"
            disabled={!output || busy !== null}
            onClick={() => void run(format.value)}
          >
            {busy === format.value ? '…' : format.label}
          </button>
        ))}
      </div>

      {!output ? (
        <p className="ga-caption">
          <Icon name="info" size={13} /> Export unlocks as soon as you generate a poster.
        </p>
      ) : (
        <div className="ga-row">
          <Chip tone="success" dot>
            Ready
          </Chip>
          {state.svg?.approximations.length ? (
            <Chip tone="warning">{state.svg.approximations.length} vector caveat(s)</Chip>
          ) : null}
        </div>
      )}

      {state.svg?.approximations.length ? (
        <Disclosure summary="What the vector file approximates">
          <ul className="ga-warning-list">
            {state.svg.approximations.map((note, index) => (
              <li key={index}>
                <Icon name="info" size={14} />
                <span>{note}</span>
              </li>
            ))}
            <li>
              <Icon name="layers" size={14} />
              <span>
                Roadmap: true outline tracing (glyph contours as editable paths) is planned so
                lettering can be node-edited in Illustrator or Figma without the embedded font.
              </span>
            </li>
          </ul>
        </Disclosure>
      ) : null}
    </Panel>
  );
}
