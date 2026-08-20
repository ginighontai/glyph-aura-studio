import { STAGES } from '@/types/project';
import { useStudio } from '@/state/store';
import { Icon } from './ui';

export function ProgressStages() {
  const { state } = useStudio();
  const anyActivity = state.stages.some((stage) => stage.state !== 'pending');
  if (!anyActivity && !state.generating) return null;

  return (
    <div className="ga-stages" aria-live="polite" aria-label="Generation progress">
      {STAGES.map((definition, index) => {
        const progress = state.stages[index];
        return (
          <div className={`ga-stage ga-stage--${progress.state}`} key={definition.id}>
            <span className="ga-stage__bullet">
              {progress.state === 'done' ? <Icon name="check" size={11} strokeWidth={2.4} /> : null}
              {progress.state === 'failed' ? <Icon name="close" size={11} strokeWidth={2.4} /> : null}
            </span>
            <span className="ga-grow">
              {definition.label}
              {progress.state === 'active' ? (
                <span className="ga-caption" style={{ display: 'block' }}>
                  {definition.detail}
                </span>
              ) : null}
            </span>
            {progress.note ? <span className="ga-stage__note">{progress.note}</span> : null}
          </div>
        );
      })}
    </div>
  );
}
