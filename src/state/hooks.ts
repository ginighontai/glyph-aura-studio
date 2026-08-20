import { useCallback, useEffect } from 'react';
import { fetchCapabilities } from '@/lib/api/client';
import { warmFontCache } from '@/lib/render/fonts';
import type { AppNotice, ErrorCode } from '@/types/project';
import { createNoticeId, useStudio } from './store';

export interface NotifyInput {
  tone: AppNotice['tone'];
  title: string;
  message: string;
  code?: ErrorCode;
  actionLabel?: string;
  action?: () => void;
  /** Milliseconds before auto-dismiss; errors stay until dismissed by default. */
  ttl?: number | null;
}

export function useNotify() {
  const { dispatch } = useStudio();

  return useCallback(
    (input: NotifyInput) => {
      const id = createNoticeId();
      dispatch({
        type: 'notice/push',
        notice: {
          id,
          tone: input.tone,
          title: input.title,
          message: input.message,
          code: input.code,
          actionLabel: input.actionLabel,
          action: input.action,
        },
      });
      const ttl = input.ttl === undefined ? (input.tone === 'error' ? null : 6000) : input.ttl;
      if (ttl) {
        setTimeout(() => dispatch({ type: 'notice/dismiss', id }), ttl);
      }
      return id;
    },
    [dispatch],
  );
}

/** Asks the server once what it can actually do, so the UI never lies. */
export function useCapabilities(): void {
  const { dispatch } = useStudio();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const capabilities = await fetchCapabilities();
        if (!cancelled) dispatch({ type: 'capabilities/set', capabilities });
      } catch {
        // A missing API server is a normal, supported state: the vector engine
        // and the local analyser work without it.
        if (!cancelled) dispatch({ type: 'capabilities/set', capabilities: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dispatch]);
}

/** Warms the most likely faces so the first render is not a fallback face. */
export function useFontWarmup(): void {
  useEffect(() => {
    warmFontCache(['Latin', 'Bengali', 'Devanagari']);
  }, []);
}
