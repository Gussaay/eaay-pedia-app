// What the signed-in person may do with one quiz (lib/access.js), and the
// unlock requests they have already sent.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from './useAuth';
import { subscribe } from '../lib/rtdb';
import { placeOfSource } from '../lib/banks';
import { quizAccess, scopesOf } from '../lib/access';

/**
 * Access to one quiz from its loaded meta (lib/quizSource.js). `ready` turns
 * true once both the access record and the quiz's bank are known, so a screen
 * never shuts someone out while a bank-wide unlock is still on its way.
 */
export function useQuizAccess(meta) {
  const { access } = useAuth();
  const source = meta?.source || meta?.book || '';
  const needBank = !!meta && !meta.bank && !!source && access?.level !== 'full';
  const [bank, setBank] = useState({ source: null, value: '', group: '' });

  useEffect(() => {
    if (!needBank || bank.source === source) return undefined;
    let live = true;
    placeOfSource(source)
      .catch(() => ({ bank: '', group: '' }))
      .then((p) => live && setBank({ source, value: p.bank, group: p.group }));
    return () => {
      live = false;
    };
  }, [needBank, source, bank.source]);

  const scopes = useMemo(
    () =>
      meta
        ? scopesOf(meta, {
            bank: meta.bank || (bank.source === source ? bank.value : ''),
            group: bank.source === source ? bank.group : '',
            bookTitle: meta.name,
          })
        : [],
    [meta, bank, source],
  );
  const result = useMemo(() => quizAccess(access, scopes), [access, scopes]);
  const ready = !!access && !!meta && (!needBank || bank.source === source);
  return { ...result, scopes, ready };
}

/** For lists: a function from a quiz's scopes to "full", "partial" or "locked". */
export function useAccessCheck() {
  const { access } = useAuth();
  return useCallback((scopes) => (access ? quizAccess(access, scopes).level : 'full'), [access]);
}

/** unlock_requests/<uid>, live. */
export function useMyRequests() {
  const { user } = useAuth();
  const [requests, setRequests] = useState({});
  useEffect(() => (user ? subscribe(`unlock_requests/${user.uid}`, (v) => setRequests(v || {})) : undefined), [user]);
  return requests;
}
