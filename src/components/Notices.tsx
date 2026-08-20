import { useStudio } from '@/state/store';
import { Icon } from './ui';

const TONE_ICON: Record<string, string> = {
  error: 'alert',
  warning: 'alert',
  success: 'check',
  info: 'info',
};

export function Notices() {
  const { state, dispatch } = useStudio();
  if (!state.notices.length) return null;

  return (
    <div className="ga-notices" role="region" aria-label="Notifications">
      {state.notices.map((notice) => (
        <div className={`ga-notice ga-notice--${notice.tone}`} key={notice.id} role="status">
          <span className="ga-notice__bar" aria-hidden="true" />
          <div className="ga-notice__body">
            <span className="ga-notice__title">
              <Icon name={TONE_ICON[notice.tone] ?? 'info'} size={13} /> {notice.title}
            </span>
            <span className="ga-caption" style={{ whiteSpace: 'pre-wrap' }}>
              {notice.message}
            </span>
            {notice.action && notice.actionLabel ? (
              <button
                type="button"
                className="ga-btn ga-btn--outline"
                style={{ alignSelf: 'flex-start', marginTop: 6 }}
                onClick={() => {
                  notice.action?.();
                  dispatch({ type: 'notice/dismiss', id: notice.id });
                }}
              >
                {notice.actionLabel}
              </button>
            ) : null}
          </div>
          <button
            type="button"
            className="ga-btn ga-btn--quiet"
            aria-label="Dismiss notification"
            style={{ alignSelf: 'flex-start', padding: 4, minHeight: 24 }}
            onClick={() => dispatch({ type: 'notice/dismiss', id: notice.id })}
          >
            <Icon name="close" size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}
