import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from './api';

/** Fetch on mount / when the path changes. Returns data, error, loading and a reload function. */
export function useApi<T = any>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(!!path);
  const ctrl = useRef<AbortController | null>(null);
  const load = useCallback(async (quiet = false) => {
    if (!path) return;
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    if (!quiet) setLoading(true);
    try {
      const d = await api<T>(path, { signal: c.signal });
      if (!c.signal.aborted) { setData(d); setError(null); }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError(e as ApiError);
    } finally {
      if (!c.signal.aborted) setLoading(false);
    }
  }, [path]);
  useEffect(() => { load(); return () => ctrl.current?.abort(); }, [load]);
  return { data, error, loading, reload: () => load(true), setData };
}
