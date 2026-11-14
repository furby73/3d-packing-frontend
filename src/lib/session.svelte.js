import { api, onSessionRejected } from './api.js';
import { authConfigured, authMessage, redirectError, signOut as firebaseSignOut, watchUser } from './firebase.js';

export const session = $state({
  phase: authConfigured ? 'loading' : 'config',
  firebaseUser: null,
  me: null,
  error: '',
  notice: ''
});

export const projectIndex = $state({ total: null, recent: [] });

let generation = 0;

export function startSession() {
  if (!authConfigured) return () => {};
  redirectError().then((error) => {
    const message = error && authMessage(error);
    if (message) session.notice = message;
  });
  const stopRejected = onSessionRejected((error) => {
    if (session.phase === 'ready') settle(error);
  });
  const stopWatching = watchUser((user) => {
    session.firebaseUser = user;
    if (user) load();
    else {
      generation++;
      session.me = null;
      projectIndex.total = null;
      projectIndex.recent = [];
      if (session.phase !== 'deleted') session.phase = 'signed-out';
    }
  });
  return () => {
    stopRejected();
    stopWatching();
  };
}

async function load() {
  const current = ++generation;
  session.phase = 'loading';
  session.error = '';
  try {
    const me = await api.me();
    if (current !== generation) return;
    session.me = me;
    session.phase = me.status === 'DISABLED' ? 'disabled' : 'ready';
    if (session.phase === 'ready') refreshProjectIndex();
  } catch (error) {
    if (current === generation) settle(error);
  }
}

function settle(error) {
  if (error?.status === 401 && error.accountState === 'disabled') {
    session.phase = 'disabled';
  } else if (error?.status === 401 && error.accountState === 'deleted') {
    session.notice = 'This account has been deleted. Sign in with another account.';
    session.phase = 'deleted';
    firebaseSignOut().finally(() => (session.phase = 'signed-out'));
  } else if (error?.status === 401) {
    session.notice = 'The server did not accept your sign-in. Sign in again.';
    firebaseSignOut();
  } else {
    session.error = error?.message ?? String(error);
    session.phase = 'error';
  }
}

export const retrySession = () => load();

export function setMe(me) {
  session.me = me;
}

export async function signOut(notice = '') {
  session.notice = notice;
  await firebaseSignOut();
}

export async function refreshProjectIndex() {
  try {
    const [all, recent] = await Promise.all([
      api.projects({ size: 1 }),
      api.projects({ size: 4, sort: 'updatedAt', direction: 'DESC' })
    ]);
    projectIndex.total = all.totalElements;
    projectIndex.recent = recent.content;
  } catch {
    projectIndex.recent = [];
  }
}
