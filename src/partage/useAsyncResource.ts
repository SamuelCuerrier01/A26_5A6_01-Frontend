import { useCallback, useEffect, useRef, useState } from 'react';

export type LoadState<T> =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'empty' }
  | { status: 'ready'; data: T };

type Settled<T> = Exclude<LoadState<T>, { status: 'loading' }>;
const LOADING = { status: 'loading' } as const;

export function useAsyncResource<T>(
  load: () => Promise<T>,
  isEmpty: (data: T) => boolean,
  describeError: (error: unknown) => string
) {
  const [remote, setRemote] = useState<{
    load: () => Promise<T>;
    state: Settled<T>;
  } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const requestId = useRef(0);
  const isEmptyRef = useRef(isEmpty);
  const describeRef = useRef(describeError);
  useEffect(() => {
    isEmptyRef.current = isEmpty;
    describeRef.current = describeError;
  });

  const state: LoadState<T> =
    remote && remote.load === load ? remote.state : LOADING;

  const settle = useCallback(
    (data: T) =>
      setRemote({
        load,
        state: isEmptyRef.current(data)
          ? { status: 'empty' }
          : { status: 'ready', data },
      }),
    [load]
  );

  const loadInto = useCallback(
    async (id: number, isCancelled: () => boolean = () => false) => {
      try {
        const data = await load();
        if (id !== requestId.current || isCancelled()) return;
        settle(data);
      } catch (error) {
        if (id !== requestId.current || isCancelled()) return;
        setRemote({
          load,
          state: { status: 'error', message: describeRef.current(error) },
        });
      } finally {
        if (id === requestId.current) setRefreshing(false);
      }
    },
    [load, settle]
  );

  useEffect(() => {
    const counter = requestId;
    const id = ++counter.current;
    let cancelled = false;
    void loadInto(id, () => cancelled);
    return () => {
      cancelled = true;
      counter.current++;
    };
  }, [loadInto]);

  const retry = useCallback(async () => {
    const id = ++requestId.current;
    setRefreshError(null);
    setRefreshing(false);
    setRemote(null);
    await loadInto(id);
  }, [loadInto]);

  const refresh = useCallback(async () => {
    const id = ++requestId.current;
    setRefreshError(null);
    setRefreshing(true);
    try {
      const data = await load();
      if (id !== requestId.current) return;
      settle(data);
    } catch (error) {
      if (id !== requestId.current) return;
      const message = describeRef.current(error);
      setRemote((prev) =>
        prev && prev.load === load && prev.state.status === 'ready'
          ? prev
          : { load, state: { status: 'error', message } }
      );
      setRefreshError(message);
    } finally {
      if (id === requestId.current) setRefreshing(false);
    }
  }, [load, settle]);

  return { state, refreshing, refreshError, retry, refresh };
}
