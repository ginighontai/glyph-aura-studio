import { FONT_LIBRARY, FONT_LICENSE, FONT_SOURCE } from '@/lib/render/fonts';
import { useStudio } from '@/state/store';

export function Footer() {
  const { state, dispatch } = useStudio();

  return (
    <footer className="ga-footer">
      <div className="ga-footer__inner">
        <div className="ga-footer__col">
          <strong style={{ fontSize: '0.9rem' }}>GlyphAura Studio</strong>
          <span className="ga-caption">
            Multilingual typography and calligraphy style transfer for English, Bengali and Hindi.
          </span>
        </div>

        <div className="ga-footer__col">
          <span className="ga-label">Engines</span>
          <span className="ga-caption">In-browser vector engine — always available</span>
          <span className="ga-caption">
            Gemini analyst &amp; image engine —{' '}
            {state.capabilities?.geminiConfigured ? 'connected' : 'add a key in .env'}
          </span>
        </div>

        <div className="ga-footer__col">
          <span className="ga-label">Type</span>
          <span className="ga-caption">
            {FONT_LIBRARY.length} faces under the {FONT_LICENSE}
          </span>
          <a className="ga-caption" href={FONT_SOURCE} target="_blank" rel="noreferrer">
            Vendored from google/fonts
          </a>
        </div>

        <div className="ga-footer__col">
          <span className="ga-label">Help</span>
          <button
            type="button"
            className="ga-btn ga-btn--quiet"
            style={{ alignSelf: 'flex-start', paddingLeft: 0 }}
            onClick={() => dispatch({ type: 'help/set', open: true })}
          >
            Open the help drawer
          </button>
          <span className="ga-caption">
            Your API key stays on the server — the browser never sees it.
          </span>
        </div>
      </div>
    </footer>
  );
}
