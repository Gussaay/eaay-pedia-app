import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { getList, readCache } from '../lib/rtdb';
import { connectivityStore, reportRequestFailure } from '../lib/connectivity';

// Firebase's get() can sit unresolved for a long time when the connection is
// broken rather than absent. Without this the screen shows loading skeletons
// for ever and never explains why, which is exactly what people reported.
const STALL_MS = 12_000;

function withStallWatch(promise) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reportRequestFailure();
      reject(Object.assign(new Error('The server did not respond. Check your connection.'), { stalled: true }));
    }, STALL_MS);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

/**
 * Loads a list node once. Shows the cached copy immediately (stale-while-
 * revalidate), then replaces it with fresh data from the server.
 */
export function useList(path, { filter, sort } = {}) {
  const filterRef = useRef(filter);
  const sortRef = useRef(sort);
  filterRef.current = filter;
  sortRef.current = sort;

  const shape = useCallback((list) => {
    let out = list || [];
    if (filterRef.current) out = out.filter(filterRef.current);
    if (sortRef.current) out = [...out].sort(sortRef.current);
    return out;
  }, []);

  const cached = path ? readCache(path) : null;
  const [raw, setRaw] = useState(cached);
  const [loading, setLoading] = useState(!!path && !cached);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    if (!path) return;
    setRaw((r) => r ?? readCache(path));
    setLoading((l) => l || !readCache(path));
    try {
      setError(null);
      setRaw(await withStallWatch(getList(path)));
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { data: raw ? shape(raw) : [], loading, error, reload };
}

/** Async loader with loading/error state. */
export function useAsync(fn, deps) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const run = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      setState({ data: await withStallWatch(Promise.resolve().then(fn)), loading: false, error: null });
    } catch (error) {
      setState({ data: null, loading: false, error });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => {
    run();
  }, [run]);
  return { ...state, reload: run };
}

export function useOnline() {
  // Deliberately the confirmed status, not navigator.onLine: a phone on Wi-Fi
  // with no working connection reports itself as online, and the screens that
  // call this use it to decide whether an action can succeed.
  const { status } = useSyncExternalStore(
    connectivityStore.subscribe,
    connectivityStore.getSnapshot,
    () => ({ status: 'online' }),
  );
  return status === 'online' || status === 'checking';
}
