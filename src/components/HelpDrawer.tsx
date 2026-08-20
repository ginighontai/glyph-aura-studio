import { useEffect } from 'react';
import { FONT_LIBRARY, FONT_LICENSE, FONT_SOURCE } from '@/lib/render/fonts';
import { useStudio } from '@/state/store';
import { Chip, Disclosure, Icon } from './ui';

export function HelpDrawer() {
  const { state, dispatch } = useStudio();

  useEffect(() => {
    if (!state.helpOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dispatch({ type: 'help/set', open: false });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dispatch, state.helpOpen]);

  if (!state.helpOpen) return null;
  const capabilities = state.capabilities;

  return (
    <div className="ga-drawer" role="dialog" aria-modal="true" aria-label="Help">
      <button
        type="button"
        className="ga-drawer__scrim"
        aria-label="Close help"
        onClick={() => dispatch({ type: 'help/set', open: false })}
      />
      <div className="ga-drawer__panel">
        <div className="ga-row" style={{ justifyContent: 'space-between' }}>
          <h2 className="ga-title" style={{ fontSize: '1.4rem' }}>
            Help
          </h2>
          <button
            type="button"
            className="ga-icon-btn"
            aria-label="Close help"
            onClick={() => dispatch({ type: 'help/set', open: false })}
          >
            <Icon name="close" size={16} />
          </button>
        </div>

        <div className="ga-field">
          <span className="ga-label">Server capabilities</span>
          <div className="ga-row">
            <Chip tone={capabilities?.geminiConfigured ? 'success' : 'warning'} dot>
              {capabilities?.geminiConfigured ? 'Gemini connected' : 'No API key'}
            </Chip>
            <Chip tone={capabilities?.imageGeneration ? 'success' : 'default'}>
              image generation {capabilities?.imageGeneration ? 'on' : 'off'}
            </Chip>
            <Chip tone={capabilities?.ocrVerification ? 'success' : 'default'}>
              OCR check {capabilities?.ocrVerification ? 'on' : 'off'}
            </Chip>
          </div>
          <p className="ga-caption">
            {capabilities?.geminiConfigured
              ? `Text model: ${capabilities.models.text}. Image model: ${capabilities.models.image ?? 'not set'}.`
              : 'Everything you see still works: the reference is measured in your browser and the vector engine renders locally. Add a key to .env for the Gemini analyst, OCR verification and raster generation.'}
          </p>
        </div>

        <Disclosure summary="The workflow, briefly" defaultOpen>
          <ol className="ga-stack" style={{ paddingLeft: 18, margin: 0, gap: 8 }}>
            <li className="ga-caption">Upload a reference, or load an example style.</li>
            <li className="ga-caption">Check the Style Analysis panel — correct the script if needed.</li>
            <li className="ga-caption">Choose a language and type your text (phonetic input for Bengali and Hindi).</li>
            <li className="ga-caption">Pick an aspect ratio and a generation mode, then Generate.</li>
            <li className="ga-caption">Tune the fidelity sliders — the vector engine re-renders live.</li>
            <li className="ga-caption">Export PNG, JPG or SVG at up to 4×.</li>
          </ol>
        </Disclosure>

        <Disclosure summary="Phonetic typing rules">
          <div className="ga-stack">
            <p className="ga-caption">
              Digraphs make aspirates (<code>kh</code>, <code>gh</code>, <code>bh</code>), capitals make
              retroflex consonants (<code>T</code>, <code>D</code>, <code>N</code>), and an apostrophe
              splits a digraph (<code>k'h</code>).
            </p>
            <p className="ga-caption">
              <code>/</code> forces a hasanta/halant, <code>~</code> adds candrabindu, <code>M</code> or{' '}
              <code>ng</code> adds anusvara, and <code>|</code> becomes a daṇḍa.
            </p>
            <p className="ga-caption">
              Bengali treats a word-final <code>o</code> as ও-kar (<code>bhalo</code> → ভালো) and a
              medial <code>o</code> as the inherent vowel (<code>kolom</code> → কলম). Hindi turns{' '}
              <code>n</code> before a stop into anusvara (<code>mandir</code> → मंदिर).
            </p>
            <p className="ga-caption">
              A curated lexicon overrides the rules for conventional spellings, and the full guide sits
              inside the composer panel.
            </p>
          </div>
        </Disclosure>

        <Disclosure summary="Why my text must not change">
          <p className="ga-caption">
            Image models routinely mangle lettering, and the damage is worse in Bengali and Devanagari
            where a misplaced matra changes the word. The vector engine avoids the problem entirely by
            setting your string with a real font and the browser's shaping engine. If you use the AI
            engine, an OCR pass reads the poster back and compares it with what you typed; any drift
            offers a stricter regeneration.
          </p>
        </Disclosure>

        <Disclosure summary="Fonts and licensing">
          <div className="ga-stack">
            <p className="ga-caption">
              {FONT_LIBRARY.length} faces are bundled under the {FONT_LICENSE}, vendored from{' '}
              <a href={FONT_SOURCE} target="_blank" rel="noreferrer">
                google/fonts
              </a>
              . Each family's licence text ships in <code>public/fonts/licenses/</code>.
            </p>
            <p className="ga-caption">
              Posters you generate are yours. Check the licence of any reference image you upload — the
              studio only reads its style, but the artwork itself may be someone else's.
            </p>
          </div>
        </Disclosure>

        <Disclosure summary="Keyboard and accessibility">
          <div className="ga-stack">
            <p className="ga-caption">
              Every control is reachable by keyboard, focus is always visible, and the output image
              carries alt text describing the words, script and typeface. Escape closes this drawer.
            </p>
            <p className="ga-caption">
              Motion respects <code>prefers-reduced-motion</code>, and the interface follows your system
              appearance until you override it with the theme button.
            </p>
          </div>
        </Disclosure>
      </div>
    </div>
  );
}
