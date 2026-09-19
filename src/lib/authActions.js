import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signInWithCredential,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
} from 'firebase/auth';
import { auth } from '../firebase';
import { isNative } from './native';
import { getOne, updateAt } from './rtdb';
import { GOOGLE_WEB_CLIENT_ID } from '../config';

let socialReady = false;
async function nativeGoogleIdToken() {
  const { SocialLogin } = await import('@capgo/capacitor-social-login');
  if (!socialReady) {
    await SocialLogin.initialize({ google: { webClientId: GOOGLE_WEB_CLIENT_ID } });
    socialReady = true;
  }
  const res = await SocialLogin.login({ provider: 'google', options: {} });
  const idToken = res?.result?.idToken || res?.idToken;
  if (!idToken) throw new Error('Google sign-in did not return a token.');
  return idToken;
}

/**
 * The Android app wrote name/img/uid/email after every Google sign-in, which
 * overwrote a custom name or photo. Here we only fill fields that are missing.
 */
async function saveGoogleProfile(user) {
  const current = (await getOne(`quizusers/${user.uid}`)) || {};
  const patch = { uid: user.uid, email: user.email || '' };
  if (!current.name && user.displayName) patch.name = user.displayName;
  if (!current.img && user.photoURL) patch.img = user.photoURL;
  await updateAt(`quizusers/${user.uid}`, patch);
}

export async function signInWithGoogle() {
  let cred;
  if (isNative) {
    const idToken = await nativeGoogleIdToken();
    cred = await signInWithCredential(auth, GoogleAuthProvider.credential(idToken));
  } else {
    const provider = new GoogleAuthProvider();
    try {
      cred = await signInWithPopup(auth, provider);
    } catch (e) {
      if (e?.code === 'auth/popup-blocked' || e?.code === 'auth/operation-not-supported-in-this-environment') {
        await signInWithRedirect(auth, provider);
        return null;
      }
      throw e;
    }
  }
  await saveGoogleProfile(cred.user);
  return cred.user;
}

export async function completeGoogleRedirect() {
  if (isNative) return null;
  const res = await getRedirectResult(auth).catch(() => null);
  if (res?.user) await saveGoogleProfile(res.user);
  return res?.user || null;
}

export const signInEmail = (email, password) => signInWithEmailAndPassword(auth, email, password);

export async function signUpEmail(email, password) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await updateAt(`quizusers/${cred.user.uid}`, { uid: cred.user.uid, email, mail: email });
  return cred.user;
}

export const resetPassword = (email) => sendPasswordResetEmail(auth, email);

export function authMessage(err) {
  const code = err?.code || '';
  const map = {
    'auth/invalid-email': 'The email address is badly formatted.',
    'auth/missing-password': 'Enter password.',
    'auth/weak-password': 'Password should be at least 6 characters.',
    'auth/email-already-in-use': 'This email is already registered. Please sign in instead.',
    'auth/too-many-requests': 'Too many attempts. Please wait a moment and try again.',
    'auth/network-request-failed': 'No internet connection. Please try again.',
    'auth/popup-closed-by-user': 'Google sign-in was cancelled.',
    'auth/invalid-credential': 'Wrong email or password.',
    'auth/wrong-password': 'Wrong email or password.',
  };
  return map[code] || err?.message || 'Something went wrong, please try again.';
}
