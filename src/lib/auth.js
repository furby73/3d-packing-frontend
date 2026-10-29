import { initializeApp } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut
} from 'firebase/auth';

const runtime = window.APP_CONFIG ?? {};
const config = {
  apiKey: runtime.firebaseApiKey || import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: runtime.firebaseAuthDomain || import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: runtime.firebaseProjectId || import.meta.env.VITE_FIREBASE_PROJECT_ID
};

export const authConfigured = Boolean(config.apiKey);

const auth = authConfigured ? getAuth(initializeApp(config)) : null;

export const onUserChanged = (callback) => onAuthStateChanged(auth, callback);
export const signIn = (email, password) => signInWithEmailAndPassword(auth, email, password);
export const signUp = (email, password) => createUserWithEmailAndPassword(auth, email, password);
export const signOut = () => firebaseSignOut(auth);

export function idToken({ force = false } = {}) {
  const user = auth?.currentUser;
  return user ? user.getIdToken(force) : Promise.reject(new Error('Not signed in'));
}

export function authMessage(error) {
  const code = error?.code?.replace(/^auth\//, '');
  return code ? code.replaceAll('-', ' ') : (error?.message ?? String(error));
}
