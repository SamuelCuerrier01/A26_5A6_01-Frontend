import { useCallback, useEffect, useRef, useState } from 'react';

import {
  normalizeQuery,
  type SearchInput,
  type SearchPage,
  type SearchResult,
} from './search';

const DEFAULT_DEBOUNCE_MS = 350;

export type SearchStatus =
  'idle' | 'tooShort' | 'loading' | 'ready' | 'empty' | 'error';

type Remote =
  | {
      key: string;
      status: 'ready';
      results: SearchResult[];
      nextCursor: string | null;
    }
  | { key: string; status: 'error'; message: string };

function appendUnique(
  current: SearchResult[],
  page: SearchResult[]
): SearchResult[] {
  const seen = new Set(current.map((r) => r.id));
  return [
    ...current,
    ...page.filter((r) => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    }),
  ];
}

export type SearchDependencies = {
  search: (input: SearchInput) => Promise<SearchPage>;
  describeError: (error: unknown) => string;
  debounceMs?: number;
};

export function useSearchResults(
  {
    search,
    describeError,
    debounceMs = DEFAULT_DEBOUNCE_MS,
  }: SearchDependencies,
  conversationId?: string
) {
  const [query, setQuery] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [remote, setRemote] = useState<Remote | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  const moreRequest = useRef(false);
  const moreController = useRef<AbortController | null>(null);
  const deps = useRef({ search, describeError });
  useEffect(() => {
    deps.current = { search, describeError };
  });

  const normalized = normalizeQuery(query);
  const key = `${conversationId ?? ''}|${normalized ?? ''}|${attempt}`;

  useEffect(() => {
    if (!normalized) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      deps.current
        .search({ q: normalized, conversationId, signal: controller.signal })
        .then(
          (page) => {
            if (!controller.signal.aborted)
              setRemote({
                key,
                status: 'ready',
                results: page.results,
                nextCursor: page.nextCursor,
              });
          },
          (error: unknown) => {
            if (!controller.signal.aborted)
              setRemote({
                key,
                status: 'error',
                message: deps.current.describeError(error),
              });
          }
        );
    }, debounceMs);
    return () => {
      clearTimeout(timer);
      controller.abort();
      moreController.current?.abort();
      moreRequest.current = false;
      setLoadingMore(false);
      setMoreError(null);
    };
  }, [normalized, conversationId, key, debounceMs]);

  const current = remote?.key === key ? remote : null;
  let status: SearchStatus;
  if (!normalized) status = query.trim() ? 'tooShort' : 'idle';
  else if (!current) status = 'loading';
  else if (current.status === 'error') status = 'error';
  else status = current.results.length ? 'ready' : 'empty';

  const results = current?.status === 'ready' ? current.results : [];
  const nextCursor = current?.status === 'ready' ? current.nextCursor : null;

  const loadMore = useCallback(async () => {
    if (
      !normalized ||
      !current ||
      current.status !== 'ready' ||
      !current.nextCursor ||
      moreRequest.current
    )
      return;
    moreRequest.current = true;
    setLoadingMore(true);
    setMoreError(null);
    const controller = new AbortController();
    moreController.current = controller;
    try {
      const page = await deps.current.search({
        q: normalized,
        conversationId,
        cursor: current.nextCursor,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      setRemote({
        ...current,
        results: appendUnique(current.results, page.results),
        nextCursor: page.nextCursor,
      });
    } catch (error) {
      if (!controller.signal.aborted)
        setMoreError(deps.current.describeError(error));
    } finally {
      if (!controller.signal.aborted) {
        moreRequest.current = false;
        setLoadingMore(false);
      }
    }
  }, [normalized, conversationId, current]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return {
    query,
    setQuery,
    status,
    term: normalized ?? '',
    results,
    hasMore: nextCursor !== null,
    errorMessage: current?.status === 'error' ? current.message : null,
    loadingMore,
    moreError,
    loadMore,
    retry,
  };
}
