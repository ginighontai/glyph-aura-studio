import { useMemo, type ChangeEvent } from 'react';
import { detectScript, strayLatinRuns } from '@/lib/script/detect';
import { NATIVE_PALETTE, PHONETIC_GUIDE, supportsPhonetic } from '@/lib/script/transliterate';
import { presetById } from '@/lib/presets/examples';
import { selectFont } from '@/lib/render/fonts';
import { activeScript, useStudio } from '@/state/store';
import { useTransliteration } from '@/state/useTransliteration';
import { LANGUAGES, languageById } from '@/types/project';
import { Chip, Disclosure, Icon, Panel, Segmented } from './ui';

export function ComposePanel() {
  const { state, dispatch } = useStudio();
  const script = activeScript(state);
  const language = languageById(state.language);
  const { conversion, canRefine, refine, insert } = useTransliteration();

  const phonetic = state.typingMode === 'phonetic' && language.supportsPhonetic;
  const detection = useMemo(() => detectScript(state.text), [state.text]);
  const strays = useMemo(
    () => (script === 'Latin' ? [] : strayLatinRuns(state.text)),
    [script, state.text],
  );

  const previewFont = useMemo(() => {
    if (!state.analysis.style) return null;
    return selectFont(state.analysis.style.dna, script, state.fontOverride ?? undefined).font;
  }, [script, state.analysis.style, state.fontOverride]);

  const sample = () => {
    const preset = state.activePresetId ? presetById(state.activePresetId) : undefined;
    const text = preset ? preset.sampleText[script] : language.sample;
    if (phonetic && language.phoneticSample && !preset) {
      dispatch({ type: 'phonetic/set', value: language.phoneticSample });
    } else {
      dispatch({ type: 'text/set', value: text, byHand: true });
    }
  };

  const characters = Array.from(state.text).length;
  const lines = state.text.split('\n').length;

  return (
    <Panel
      step="Step 3"
      title="Your text"
      icon="type"
      id="compose"
      subtitle="Type in English, Bengali or Hindi. Every character you enter is what gets set — nothing is paraphrased."
      actions={
        <button type="button" className="ga-btn ga-btn--quiet" onClick={sample}>
          <Icon name="wand" size={14} />
          Sample
        </button>
      }
    >
      <div className="ga-field">
        <span className="ga-label">Language</span>
        <Segmented
          label="Language"
          value={state.language}
          onChange={(value) => dispatch({ type: 'language/set', language: value })}
          options={LANGUAGES.map((entry) => ({
            value: entry.id,
            label: `${entry.label} · ${entry.endonym}`,
            title: `Set text in ${entry.label}`,
          }))}
        />
      </div>

      <div className="ga-field">
        <span className="ga-label">Typing mode</span>
        <Segmented
          label="Typing mode"
          value={state.typingMode}
          onChange={(value) => dispatch({ type: 'typingMode/set', mode: value })}
          options={[
            { value: 'native', label: 'Native script' },
            {
              value: 'phonetic',
              label: 'Phonetic',
              disabled: !language.supportsPhonetic,
              title: language.supportsPhonetic
                ? `Type ${language.label} sounds with Latin letters`
                : 'English is already Latin — phonetic input does not apply',
            },
          ]}
        />
        {!language.supportsPhonetic ? (
          <p className="ga-caption">
            English is typed directly. Switch to Bengali or Hindi to use the phonetic keyboard.
          </p>
        ) : null}
      </div>

      {phonetic ? (
        <div className="ga-field">
          <label className="ga-label" htmlFor="ga-phonetic">
            Phonetic input (Latin letters)
          </label>
          <input
            id="ga-phonetic"
            className="ga-input"
            value={state.phoneticInput}
            spellCheck={false}
            autoCapitalize="none"
            autoComplete="off"
            placeholder={language.phoneticSample || 'type here'}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              dispatch({ type: 'phonetic/set', value: event.currentTarget.value })
            }
          />
          <p className="ga-caption">
            {language.id === 'bn'
              ? 'ami → আমি · bhalo → ভালো · bangla → বাংলা'
              : 'namaste → नमस्ते · bharat → भारत · pyaar → प्यार'}
          </p>
        </div>
      ) : null}

      <div className="ga-field">
        <label className="ga-label" htmlFor="ga-text">
          {phonetic ? 'Converted text — edit freely' : `Text in ${language.endonym}`}
        </label>
        <textarea
          id="ga-text"
          className="ga-textarea ga-native-input"
          value={state.text}
          spellCheck={false}
          dir="ltr"
          lang={state.language}
          placeholder={language.sample}
          style={
            previewFont
              ? { fontFamily: `'${previewFont.family}', var(--ga-font-ui)` }
              : undefined
          }
          onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
            dispatch({ type: 'text/set', value: event.currentTarget.value, byHand: true })
          }
        />
        <div className="ga-row" style={{ justifyContent: 'space-between' }}>
          <div className="ga-row">
            <Chip>{characters} characters</Chip>
            <Chip>
              {lines} line{lines === 1 ? '' : 's'}
            </Chip>
            {state.text.trim() ? (
              <Chip tone={detection.dominant === script ? 'success' : 'warning'} dot>
                {detection.dominant}
              </Chip>
            ) : null}
          </div>
          {canRefine && phonetic ? (
            <button
              type="button"
              className="ga-btn ga-btn--quiet"
              disabled={state.transliterating || !state.phoneticInput.trim()}
              onClick={() => void refine()}
            >
              <Icon name={state.transliterating ? 'refresh' : 'wand'} size={14} />
              {state.transliterating ? 'Refining…' : 'Refine with Gemini'}
            </button>
          ) : null}
        </div>
        <p className="ga-caption">Line breaks are respected — use them for hierarchy.</p>
      </div>

      {state.transliterationNote ? (
        <p className="ga-caption">
          <Icon name="info" size={13} /> {state.transliterationNote}
        </p>
      ) : null}

      {conversion && conversion.unresolved.length ? (
        <ul className="ga-warning-list">
          <li>
            <Icon name="alert" size={14} />
            <span>
              These letters had no mapping and were left as-is: {conversion.unresolved.join(' ')}.
              {canRefine ? ' Try “Refine with Gemini”.' : ' Edit the converted text by hand.'}
            </span>
          </li>
        </ul>
      ) : null}

      {strays.length ? (
        <ul className="ga-warning-list">
          <li>
            <Icon name="alert" size={14} />
            <span>
              Still in Latin letters: {strays.slice(0, 6).join(', ')}. Switch to phonetic mode or fix
              them so the poster is set entirely in {script}.
            </span>
          </li>
        </ul>
      ) : null}

      {supportsPhonetic(script) ? (
        <>
          <Disclosure summary={`Phonetic guide — ${language.label}`}>
            <div className="ga-stack">
              {PHONETIC_GUIDE[script].map((section) => (
                <div className="ga-field" key={section.title}>
                  <span className="ga-label">{section.title}</span>
                  <div className="ga-guide">
                    {section.rows.map((row) => (
                      <div className="ga-guide__row" key={`${section.title}-${row.roman}`}>
                        <span className="ga-guide__roman">{row.roman}</span>
                        <span className="ga-guide__native">{row.native}</span>
                        <span className="ga-guide__note">{row.note ?? ''}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Disclosure>

          <Disclosure summary={`Character palette — ${language.endonym}`}>
            <div className="ga-keyboard">
              <p className="ga-caption">
                Tap a glyph to append it to your text. Useful for kar signs, conjuncts and
                punctuation the phonetic engine cannot guess.
              </p>
              {NATIVE_PALETTE[script].map((group) => (
                <div className="ga-keyboard__group" key={group.title}>
                  <span className="ga-label">{group.title}</span>
                  <div className="ga-keyboard__keys">
                    {group.glyphs.map((glyph) => (
                      <button
                        type="button"
                        className="ga-key"
                        key={`${group.title}-${glyph}`}
                        onClick={() => insert(glyph)}
                        aria-label={`Insert ${glyph}`}
                      >
                        {glyph}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              <div className="ga-row">
                <button
                  type="button"
                  className="ga-btn ga-btn--quiet"
                  onClick={() => insert('\n')}
                >
                  <Icon name="plus" size={13} /> Line break
                </button>
                <button
                  type="button"
                  className="ga-btn ga-btn--quiet"
                  onClick={() =>
                    dispatch({
                      type: 'text/set',
                      value: Array.from(state.text).slice(0, -1).join(''),
                      byHand: true,
                    })
                  }
                  disabled={!state.text.length}
                >
                  <Icon name="minus" size={13} /> Backspace
                </button>
                <button
                  type="button"
                  className="ga-btn ga-btn--quiet"
                  onClick={() => dispatch({ type: 'text/set', value: '', byHand: true })}
                  disabled={!state.text.length}
                >
                  <Icon name="close" size={13} /> Clear
                </button>
              </div>
            </div>
          </Disclosure>
        </>
      ) : null}
    </Panel>
  );
}
