import { initializeApp } from '@firebase/app';
import {
	createUserWithEmailAndPassword,
	getAuth,
	onAuthStateChanged,
	sendPasswordResetEmail,
	signInWithEmailAndPassword,
	signOut as firebaseSignOut,
	type Auth,
	type User
} from '@firebase/auth';

const runtime = (typeof window !== 'undefined' && window.APP_CONFIG) || {};
const config = {
	apiKey: runtime.firebaseApiKey || import.meta.env.VITE_FIREBASE_API_KEY,
	authDomain: runtime.firebaseAuthDomain || import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
	projectId: runtime.firebaseProjectId || import.meta.env.VITE_FIREBASE_PROJECT_ID
};

/** False when no Firebase key was supplied; the sign-in page says so instead of failing silently. */
export const authConfigured = Boolean(config.apiKey);

const auth: Auth | null = authConfigured ? getAuth(initializeApp(config)) : null;

/** Reactive session: `ready` turns true once Firebase has restored (or ruled out) a saved session. */
export const session = $state<{ ready: boolean; user: User | null }>({
	ready: !authConfigured,
	user: null
});

if (auth) {
	onAuthStateChanged(auth, (user) => {
		session.user = user;
		session.ready = true;
	});
}

function requireAuth(): Auth {
	if (!auth) throw new Error('Firebase is not configured (see .env.example)');
	return auth;
}

export const signIn = (email: string, password: string) =>
	signInWithEmailAndPassword(requireAuth(), email, password);

export const signUp = (email: string, password: string) =>
	createUserWithEmailAndPassword(requireAuth(), email, password);

export const resetPassword = (email: string) => sendPasswordResetEmail(requireAuth(), email);

export const signOut = () => firebaseSignOut(requireAuth());

export function idToken({ force = false } = {}): Promise<string> {
	const user = auth?.currentUser;
	return user ? user.getIdToken(force) : Promise.reject(new Error('Not signed in'));
}

const messages: Record<string, string> = {
	'invalid-credential': 'Wrong email or password.',
	'invalid-email': 'That email address does not look right.',
	'user-disabled': 'This account has been disabled.',
	'email-already-in-use': 'An account with this email already exists. Sign in instead.',
	'weak-password': 'Use a password of at least 6 characters.',
	'too-many-requests': 'Too many attempts. Wait a moment and try again.',
	'network-request-failed': 'Network error. Check your connection.',
	'missing-email': 'Enter your email first.'
};

/** Turns a Firebase error into a sentence for the form. */
export function authMessage(error: unknown): string {
	const code = (error as { code?: string })?.code?.replace(/^auth\//, '');
	if (code) return messages[code] ?? code.replaceAll('-', ' ');
	return error instanceof Error ? error.message : String(error);
}
