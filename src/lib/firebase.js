import { initializeApp } from 'firebase/app';
import {
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  getAuth,
  getRedirectResult,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut as firebaseSignOut
} from 'firebase/auth';

const runtime = window.APP_CONFIG ?? {};
const projectId = runtime.firebaseProjectId || import.meta.env.VITE_FIREBASE_PROJECT_ID || '';

export const firebaseConfig = {
  apiKey: runtime.firebaseApiKey || import.meta.env.VITE_FIREBASE_API_KEY || '',
  authDomain:
    runtime.firebaseAuthDomain || import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || (projectId ? `${projectId}.firebaseapp.com` : ''),
  projectId
};

export const missingConfig = firebaseConfig.apiKey ? [] : ['firebaseApiKey'];

export const authConfigured = missingConfig.length === 0;

export const googleConfigured = Boolean(firebaseConfig.authDomain);

const auth = authConfigured ? getAuth(initializeApp(firebaseConfig)) : null;
const ready = auth ? setPersistence(auth, browserLocalPersistence) : Promise.resolve();

const google = new GoogleAuthProvider();
google.setCustomParameters({ prompt: 'select_account' });

export function watchUser(callback) {
  if (!auth) return () => {};
  return onAuthStateChanged(auth, callback);
}

export async function redirectError() {
  if (!auth) return null;
  try {
    await getRedirectResult(auth);
    return null;
  } catch (error) {
    return error;
  }
}

export async function signInWithEmail(email, password) {
  await ready;
  return signInWithEmailAndPassword(auth, email, password);
}

export async function signUpWithEmail(email, password) {
  await ready;
  return createUserWithEmailAndPassword(auth, email, password);
}

export async function signInWithGoogle() {
  if (!googleConfigured) {
    throw Object.assign(new Error('Google sign-in needs firebaseAuthDomain or firebaseProjectId in the app configuration.'), {
      code: 'app/no-auth-domain'
    });
  }
  await ready;
  try {
    return await signInWithPopup(auth, google);
  } catch (error) {
    if (error?.code === 'auth/popup-blocked' || error?.code === 'auth/operation-not-supported-in-this-environment') {
      return signInWithRedirect(auth, google);
    }
    throw error;
  }
}

export const resetPassword = (email) => sendPasswordResetEmail(auth, email);

export const signOut = () => (auth ? firebaseSignOut(auth) : Promise.resolve());

export function currentUser() {
  return auth?.currentUser ?? null;
}

export function idToken({ force = false } = {}) {
  const user = auth?.currentUser;
  return user ? user.getIdToken(force) : Promise.reject(new Error('Not signed in'));
}

export function providersOf(user) {
  return (user?.providerData ?? []).map((entry) => entry.providerId);
}

const silent = new Set(['auth/popup-closed-by-user', 'auth/cancelled-popup-request', 'auth/user-cancelled']);

const messages = {
  'auth/invalid-credential': 'Wrong email or password.',
  'auth/invalid-login-credentials': 'Wrong email or password.',
  'auth/wrong-password': 'Wrong email or password.',
  'auth/user-not-found': 'No account uses this email. Create one instead.',
  'auth/email-already-in-use': 'An account with this email already exists. Sign in instead.',
  'auth/invalid-email': 'That email address does not look right.',
  'auth/missing-email': 'Enter your email address first.',
  'auth/missing-password': 'Enter your password.',
  'auth/weak-password': 'Use a password with at least 6 characters.',
  'auth/too-many-requests': 'Too many attempts. Wait a minute and try again.',
  'auth/network-request-failed': 'Could not reach the sign-in service. Check your connection.',
  'auth/user-disabled': 'This sign-in has been disabled by the people who run this service.',
  'auth/account-exists-with-different-credential':
    'This email already signs in another way. Use the method you used before.',
  'auth/operation-not-allowed': 'This sign-in method is not enabled for this service.',
  'auth/unauthorized-domain': `Sign-in is not allowed from ${location.host}. Add it to the authorised domains in Firebase.`,
  'auth/popup-blocked': 'The browser blocked the sign-in window. Allow pop-ups and try again.',
  'auth/invalid-api-key': 'The Firebase API key is not valid. Check the app configuration.',
  'auth/api-key-not-valid.-please-pass-a-valid-api-key.': 'The Firebase API key is not valid. Check the app configuration.'
};

export function authMessage(error) {
  const code = error?.code;
  if (code && silent.has(code)) return '';
  if (code && messages[code]) return messages[code];
  if (code && !code.startsWith('auth/')) return error.message;
  if (code) return code.replace(/^auth\//, '').replaceAll('-', ' ');
  return error?.message ?? String(error);
}
