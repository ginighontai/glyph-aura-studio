import type { ChangeEvent } from 'react';
import { useStudio } from '@/state/store';
import { useGeneration } from '@/state/useGeneration';
import { Chip, CopyButton, Disclosure, EmptyState, Icon, Panel } from './ui';

export function PromptInspector() {
  const { state, dispatch } = useStudio();
  const { generate } = useGeneration();
  const bundle = state.prompt;

  if (!bundle) {
    return (
      <Panel step="Inspect" title="Prompt inspector" icon="layers" id="prompt">
        <EmptyState
          icon="layers"
          title="No prompt built yet"
          message="Generate once and the exact instruction sent to the model appears here, editable."
        />
      </Panel>
    );
  }

  const editing = state.promptDraft !== null;
  const draft = state.promptDraft ?? bundle.prompt;

  return (
    <Panel
      step="Inspect"
      title="Prompt inspector"
      icon="layers"
      collapsible
      id="prompt"
      subtitle="Exactly what the AI image engine receives. No hidden second prompt."
      actions={<CopyButton value={draft} label="Copy prompt" />}
    >
      <div className="ga-row">
        <Chip>{draft.length.toLocaleString()} characters</Chip>
        <Chip>{bundle.sections.length} sections</Chip>
        {editing ? <Chip tone="warning">edited</Chip> : null}
        {state.engine === 'vector' ? (
          <Chip tone="accent">vector engine renders locally — the prompt is reference only</Chip>
        ) : null}
      </div>

      {editing ? (
        <div className="ga-field">
          <label className="ga-label" htmlFor="ga-prompt-editor">
            Edit the prompt
          </label>
          <textarea
            id="ga-prompt-editor"
            className="ga-textarea ga-prompt__editor"
            value={draft}
            spellCheck={false}
            onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
              dispatch({ type: 'prompt/draft', draft: event.currentTarget.value })
            }
          />
          <div className="ga-row">
            <button
              type="button"
              className="ga-btn ga-btn--primary"
              disabled={state.generating || state.engine !== 'ai-image'}
              title={
                state.engine === 'ai-image'
                  ? 'Regenerate using your edited prompt'
                  : 'Switch to the AI image engine to use a custom prompt'
              }
              onClick={() => void generate()}
            >
              <Icon name="wand" size={14} />
              Regenerate with this prompt
            </button>
            <button
              type="button"
              className="ga-btn ga-btn--outline"
              onClick={() => dispatch({ type: 'prompt/draft', draft: null })}
            >
              Revert to generated
            </button>
          </div>
          {state.engine !== 'ai-image' ? (
            <p className="ga-caption">
              <Icon name="info" size={13} /> The vector engine draws from the Style DNA and the
              sliders rather than from prose, so an edited prompt only affects AI renders.
            </p>
          ) : null}
        </div>
      ) : (
        <>
          <div className="ga-prompt">
            {bundle.sections.map((section) => (
              <div className="ga-prompt__section" key={section.title}>
                <span className="ga-label">{section.title}</span>
                <pre className="ga-prompt__body">{section.body}</pre>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="ga-btn ga-btn--outline"
            onClick={() => dispatch({ type: 'prompt/draft', draft: bundle.prompt })}
          >
            <Icon name="type" size={14} />
            Edit prompt by hand
          </button>
        </>
      )}

      <Disclosure summary="Negative prompt" badge={<CopyButton value={bundle.negativePrompt} />}>
        <pre className="ga-prompt__body">{bundle.negativePrompt}</pre>
      </Disclosure>
    </Panel>
  );
}
