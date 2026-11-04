import { useCallback, useEffect, useState } from 'react';
import { applyTheme, getThemePref, saveThemePref, watchSystemTheme } from '../lib/theme';

// [choice, setChoice] for the signed-in person (uid may be undefined).
export function useTheme(uid) {
  const [pref, setPref] = useState(() => getThemePref(uid));

  useEffect(() => {
    const p = getThemePref(uid);
    setPref(p);
    applyTheme(p);
  }, [uid]);

  useEffect(() => {
    const onChange = (e) => setPref(e.detail);
    window.addEventListener('ep-theme', onChange);
    const stop = watchSystemTheme(() => getThemePref(uid));
    return () => {
      window.removeEventListener('ep-theme', onChange);
      stop();
    };
  }, [uid]);

  const choose = useCallback((p) => saveThemePref(uid, p), [uid]);
  return [pref, choose];
}
