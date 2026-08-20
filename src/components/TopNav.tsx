import { useEffect, useState } from 'react';
import { useStudio } from '@/state/store';
import { Icon } from './ui';

const LINKS = [
  { id: 'studio', label: 'Studio' },
  { id: 'examples', label: 'Examples' },
  { id: 'how-it-works', label: 'How it works' },
  { id: 'export', label: 'Export' },
];

function LogoMark() {
  return (
    <svg className="ga-logo__mark" viewBox="0 0 32 32" role="img" aria-label="GlyphAura">
      <defs>
        <linearGradient id="ga-logo-gradient" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#0071e3" />
          <stop offset="52%" stopColor="#8e44ff" />
          <stop offset="100%" stopColor="#ff2d55" />
        </linearGradient>
      </defs>
      <rect x="1.5" y="1.5" width="29" height="29" rx="8.5" fill="url(#ga-logo-gradient)" />
      <path
        d="M21.9 11.4c-1.1-1.5-2.9-2.4-4.9-2.4-3.6 0-6.3 2.9-6.3 7s2.6 7 6.4 7c2 0 3.7-.8 4.8-2.1v-4.4h-5"
        fill="none"
        stroke="#fff"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function TopNav() {
  const { state, dispatch } = useStudio();
  const [active, setActive] = useState('studio');

  // Highlight the section the reader is actually looking at.
  useEffect(() => {
    const targets = LINKS.map((link) => document.getElementById(link.id)).filter(
      (element): element is HTMLElement => Boolean(element),
    );
    if (!targets.length || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible?.target?.id) setActive(visible.target.id);
      },
      { rootMargin: '-20% 0px -60% 0px', threshold: [0.05, 0.3, 0.6] },
    );
    for (const target of targets) observer.observe(target);
    return () => observer.disconnect();
  }, []);

  const gemini = state.capabilities?.geminiConfigured ?? false;

  return (
    <nav className="ga-nav" aria-label="Primary">
      <div className="ga-nav__inner">
        <a className="ga-logo" href="#studio">
          <LogoMark />
          <span>
            GlyphAura <span style={{ color: 'var(--ga-text-secondary)', fontWeight: 400 }}>Studio</span>
          </span>
        </a>

        <div className="ga-nav__links">
          {LINKS.map((link) => (
            <button
              key={link.id}
              type="button"
              className="ga-nav__link"
              aria-current={active === link.id ? 'true' : undefined}
              onClick={() => {
                document.getElementById(link.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
            >
              {link.label}
            </button>
          ))}
        </div>

        <div className="ga-nav__actions">
          <span
            className="ga-status-pill"
            title={
              gemini
                ? `Gemini connected · ${state.capabilities?.models.text ?? ''}`
                : 'No API key on the server — the local vector engine and in-browser analyser are active'
            }
          >
            <span
              className="ga-dot"
              style={{ color: gemini ? 'var(--ga-success)' : 'var(--ga-warning)' }}
            />
            <span className="ga-nav__status-label">{gemini ? 'Gemini' : 'Local engine'}</span>
          </span>

          <button
            type="button"
            className="ga-icon-btn"
            aria-label={`Switch to ${state.theme === 'dark' ? 'light' : 'dark'} appearance`}
            onClick={() =>
              dispatch({ type: 'theme/set', theme: state.theme === 'dark' ? 'light' : 'dark' })
            }
          >
            <Icon name={state.theme === 'dark' ? 'sun' : 'moon'} size={16} />
          </button>

          <button
            type="button"
            className="ga-icon-btn"
            aria-label="Help and keyboard shortcuts"
            aria-expanded={state.helpOpen}
            onClick={() => dispatch({ type: 'help/set', open: true })}
          >
            <Icon name="help" size={16} />
          </button>
        </div>
      </div>
    </nav>
  );
}
