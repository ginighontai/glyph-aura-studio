import { FONT_LIBRARY, FONT_LICENSE } from '@/lib/render/fonts';
import { useStudio } from '@/state/store';
import { Icon } from './ui';

const STEPS = [
  {
    title: 'Measure, don’t guess',
    body: 'The reference is segmented with an illumination-flattened threshold, then measured: stroke width from run lengths, thick/thin contrast from their spread, slant from a shear-projection search, roughness from the perimeter-to-area ratio, palette from k-means clustering, and composition from the line boxes.',
  },
  {
    title: 'Write it down as Style DNA',
    body: 'Every measurement becomes one structured object: stroke, form, colour, effects and composition profiles, plus numeric render hints. Gemini fills the same object when a key is configured, adding the reading of the reference text and a designer’s description of the hand.',
  },
  {
    title: 'Type in your own script',
    body: 'English is typed directly. Bengali and Hindi have a phonetic keyboard with a rule engine, a curated spelling lexicon and an optional Gemini refinement pass — plus a character palette for kar signs and conjuncts.',
  },
  {
    title: 'Re-letter, don’t copy',
    body: 'The engine picks the closest bundled face for your script, then modulates it: variable weight, shear for slant, a broad-nib sweep to recreate thick/thin contrast, gradients, outline, shadow, glow, emboss, ink bleed, dry-brush erosion, paper tooth and grain — all sized in ems so any resolution matches.',
  },
  {
    title: 'Prove the text survived',
    body: 'The vector engine sets your string with a real font, so characters cannot drift — fidelity is structural. AI renders are read back with OCR and compared; a mismatch offers a stricter regeneration.',
  },
  {
    title: 'Export like a studio',
    body: 'PNG, JPG and SVG at 1×, 2× or 4×. Raster exports are re-rendered at full size rather than upscaled. SVG carries live text, real gradients and filters, with the font optionally embedded.',
  },
];

export function HowItWorks() {
  const { state } = useStudio();
  const gemini = state.capabilities?.geminiConfigured ?? false;

  return (
    <section className="ga-section" id="how-it-works" aria-labelledby="how-heading">
      <div className="ga-section__head">
        <span className="ga-label">How it works</span>
        <h2 className="ga-title" id="how-heading">
          Two engines, one Style DNA
        </h2>
        <p className="ga-subtitle">
          GlyphAura never pastes your text onto the reference image. It reverse-engineers how the
          reference was drawn, then draws your words the same way.
        </p>
      </div>

      <div className="ga-steps">
        {STEPS.map((step, index) => (
          <article className="ga-step" key={step.title}>
            <span className="ga-step__index">{index + 1}</span>
            <h3 style={{ fontSize: '0.98rem' }}>{step.title}</h3>
            <p className="ga-caption">{step.body}</p>
          </article>
        ))}
      </div>

      <div className="ga-cards" style={{ marginTop: 'var(--ga-space-6)' }}>
        <article className="ga-step">
          <span className="ga-row">
            <Icon name="target" size={16} />
            <strong style={{ fontSize: '0.95rem' }}>Vector engine</strong>
          </span>
          <p className="ga-caption">
            Deterministic, offline, free. Exact characters by construction, true SVG export, and any
            output resolution. This is the default and it needs no API key.
          </p>
        </article>
        <article className="ga-step">
          <span className="ga-row">
            <Icon name="wand" size={16} />
            <strong style={{ fontSize: '0.95rem' }}>AI image engine</strong>
          </span>
          <p className="ga-caption">
            {gemini
              ? 'Connected. Gemini renders the poster as a bitmap for painterly texture that a type engine cannot fake, then OCR verifies your text.'
              : 'Add GEMINI_API_KEY and GEMINI_IMAGE_MODEL to the server .env to enable raster generation and OCR verification.'}
          </p>
        </article>
        <article className="ga-step">
          <span className="ga-row">
            <Icon name="type" size={16} />
            <strong style={{ fontSize: '0.95rem' }}>Type library</strong>
          </span>
          <p className="ga-caption">
            {FONT_LIBRARY.length} faces covering Latin, Bengali and Devanagari — serif, sans, slab,
            display, script, brush, handwriting, rounded and blackletter. All {FONT_LICENSE}, bundled
            locally so rendering never depends on a CDN.
          </p>
        </article>
      </div>
    </section>
  );
}
