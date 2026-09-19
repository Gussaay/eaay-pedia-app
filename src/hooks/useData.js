import { useCallback, useEffect, useRef, useState } from 'react';
import { Network } from '@capacitor/network';
import { getList, readCache } from '../lib/rtdb';

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
      setRaw(await getList(path));
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
      setState({ data: await fn(), loading: false, error: null });
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
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    let handle;
    Network.addListener('networkStatusChange', (s) => setOnline(s.connected)).then((h) => {
      handle = h;
    });
    Network.getStatus().then((s) => setOnline(s.connected)).catch(() => {});
    return () => handle?.remove();
  }, []);
  return online;
}
