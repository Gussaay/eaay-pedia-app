// One auth listener + the user's quizusers/<uid> record, shared through context.
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from '../firebase';
import { subscribe, updateAt } from '../lib/rtdb';
import { forgetPushToken } from '../lib/push';
import { APP_VERSION_NUMBER, isAdminEmail } from '../config';

const AuthContext = createContext(null);

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

  const value = useMemo(
    () => ({
      user,
      authLoading,
      profile,
      profileLoading,
      // Admin comes from the hard-coded list, or from the flag the User
      // manager sets — so access can be granted without a new release.
      isAdmin: isAdminEmail(user?.email) || profile?.admin === 'true',
      // Set by the User manager. The database rules are the real protection;
      // this is what stops a blocked account using the app it already has.
      blocked: profile?.blocked === 'true',
      // Same rule as MainPageActivity: prompt when any of these is missing.
      profileIncomplete:
        !!profile && !(profile.img && profile.name && profile.residency && profile.level),
    }),
    [user, authLoading, profile, profileLoading],
  );

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
