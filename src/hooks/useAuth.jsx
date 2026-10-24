// One auth listener + the user's quizusers/<uid> record, shared through context.
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from '../firebase';
import { subscribe, updateAt } from '../lib/rtdb';
import { forgetPushToken } from '../lib/push';
import { APP_VERSION_NUMBER, isAdminEmail } from '../config';
import { accessState, canAdmin, canManage, readConfig, roleOf } from '../lib/access';

const AuthContext = createContext(null);

// The last access record and settings seen, so a quiz saved for offline still
// opens with the right access when the phone has no connection.
const ACCESS_CACHE = 'access-cache:';
function readAccessCache(uid) {
  try {
    const raw = uid && localStorage.getItem(ACCESS_CACHE + uid);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function writeAccessCache(uid, value) {
  try {
    localStorage.setItem(ACCESS_CACHE + uid, JSON.stringify(value));
  } catch {
    /* storage blocked: the access is just read again next time */
  }
}

const pad = (n) => String(n).padStart(2, '0');
function nowParts() {
  const d = new Date();
  const h12 = d.getHours() % 12 || 12;
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(h12)}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`,
  };
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);
  // access/<uid> and access_config (lib/access.js). `undefined` = not heard yet.
  const [accessRecord, setAccessRecord] = useState(undefined);
  const [accessConfig, setAccessConfig] = useState(undefined);

  useEffect(
    () =>
      onAuthStateChanged(auth, (u) => {
        setUser(u || null);
        setAuthLoading(false);
      }),
    [],
  );

  useEffect(() => {
    if (!user) {
      setProfile(null);
      setProfileLoading(false);
      return undefined;
    }
    setProfileLoading(true);
    // Last-seen info, as MainPageActivity did on every launch.
    updateAt(`quizusers/${user.uid}`, { ...nowParts(), ver: String(APP_VERSION_NUMBER) }).catch(() => {});
    return subscribe(`quizusers/${user.uid}`, (val) => {
      setProfile(val || {});
      setProfileLoading(false);
    });
  }, [user]);

  useEffect(() => {
    if (!user) {
      setAccessRecord(undefined);
      setAccessConfig(undefined);
      return undefined;
    }
    const cached = readAccessCache(user.uid);
    setAccessRecord(cached ? cached.record : undefined);
    setAccessConfig(cached ? cached.config : undefined);
    const offRecord = subscribe(`access/${user.uid}`, (val) => setAccessRecord(val || null));
    const offConfig = subscribe('access_config', (val) => setAccessConfig(val || null));
    // No connection and nothing cached: go on with the defaults rather than
    // wait for ever.
    const timer = setTimeout(() => {
      setAccessRecord((v) => (v === undefined ? null : v));
      setAccessConfig((v) => (v === undefined ? null : v));
    }, 8000);
    return () => {
      clearTimeout(timer);
      offRecord();
      offConfig();
    };
  }, [user]);

  useEffect(() => {
    if (user && accessRecord !== undefined && accessConfig !== undefined)
      writeAccessCache(user.uid, { record: accessRecord, config: accessConfig });
  }, [user, accessRecord, accessConfig]);

  const value = useMemo(() => {
    // The older admin list and the User manager's admin flag still count, as
    // managers, until someone is given a role.
    const legacyAdmin = isAdminEmail(user?.email) || profile?.admin === 'true';
    const role = roleOf({ email: user?.email, record: accessRecord, legacyAdmin });
    const accessLoading = !!user && (accessRecord === undefined || accessConfig === undefined);
    return {
      user,
      authLoading,
      profile,
      profileLoading,
      role,
      isSuperuser: role === 'superuser',
      // Users, roles, access and unlock requests.
      isManager: canManage(role),
      // The admin panel: managers and editors.
      isAdmin: canAdmin(role),
      accessRecord: accessRecord || null,
      accessConfig: readConfig(accessConfig),
      accessLoading,
      // Who may open which quiz: lib/access.js, hooks/useQuizAccess.js.
      access: accessLoading ? null : accessState({ role, record: accessRecord, config: accessConfig }),
      // Set by the User manager. The database rules are the real protection;
      // this is what stops a blocked account using the app it already has.
      blocked: profile?.blocked === 'true',
      // Same rule as MainPageActivity: prompt when any of these is missing.
      profileIncomplete:
        !!profile && !(profile.img && profile.name && profile.residency && profile.level),
    };
  }, [user, authLoading, profile, profileLoading, accessRecord, accessConfig]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth() must be used inside <AuthProvider>');
  return ctx;
}

/**
 * Signing out also drops this device's push token, so the next person to use
 * the phone does not receive notifications meant for the previous account.
 */
export const logout = async () => {
  await forgetPushToken(auth.currentUser?.uid).catch(() => {});
  return signOut(auth);
};
