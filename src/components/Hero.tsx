import { FONT_LIBRARY } from '@/lib/render/fonts';
import { useStudio } from '@/state/store';
import { Icon } from './ui';

const SCRIPT_SAMPLES = [
  { glyph: 'Aa', label: 'Latin', family: 'Playfair Display Variable' },
  { glyph: 'অআক', label: 'বাংলা', family: 'Noto Serif Bengali Variable' },
  { glyph: 'अआक', label: 'हिन्दी', family: 'Noto Serif Devanagari Variable' },
];

export function Hero() {
  const { state } = useStudio();

  return (
    <header className="ga-hero">
      <span className="ga-hero__eyebrow">
        <Icon name="wand" size={13} />
        Typography &amp; calligraphy style transfer
      </span>

      <h1 className="ga-display">
        Borrow any lettering style.
        <br />
        <span className="ga-hero__gradient">Set your own words.</span>
      </h1>

      <p className="ga-subtitle">
        Upload a poster, a shop sign, or a page of handwriting. GlyphAura measures how it was drawn —
        stroke weight, contrast, slant, palette, ink, texture, composition — and re-letters your text
        in that hand, in English, Bengali or Hindi. Then it exports at print resolution.
      </p>

      <div className="ga-hero__actions">
        <button
          type="button"
          className="ga-btn ga-btn--primary ga-btn--large"
          onClick={() => document.getElementById('reference')?.scrollIntoView({ behavior: 'smooth' })}
        >
          <Icon name="upload" size={17} />
          Start with a reference
        </button>
        <button
          type="button"
          className="ga-btn ga-btn--outline ga-btn--large"
          onClick={() => document.getElementById('examples')?.scrollIntoView({ behavior: 'smooth' })}
        >
          Browse example styles
        </button>
      </div>

      <div className="ga-hero__scripts">
        {SCRIPT_SAMPLES.map((sample) => (
          <div className="ga-hero__script" key={sample.label}>
            <span className="ga-hero__script-glyph" style={{ fontFamily: `'${sample.family}', serif` }}>
              {sample.glyph}
            </span>
            <span className="ga-caption">{sample.label}</span>
          </div>
        ))}
      </div>

      <p className="ga-caption" style={{ maxWidth: '58ch' }}>
        {FONT_LIBRARY.length} open-licensed faces bundled · exact characters guaranteed by the vector
        engine ·{' '}
        {state.capabilities?.geminiConfigured
          ? 'Gemini analysis connected'
          : 'works with no API key at all'}
      </p>
    </header>
  );
}
