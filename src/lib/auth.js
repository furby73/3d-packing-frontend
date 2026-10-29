const apiKey = import.meta.env.VITE_FIREBASE_API_KEY;
const refreshToken = import.meta.env.VITE_FIREBASE_REFRESH_TOKEN;
const fixedIdToken = import.meta.env.VITE_FIREBASE_ID_TOKEN;
const refreshMargin = 5 * 60 * 1000;

let cached = null;
let pending = null;

export const authConfigured = Boolean((apiKey && refreshToken) || fixedIdToken);

async function exchange() {
  const response = await fetch(`https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Firebase token refresh failed: ${body.error?.message ?? response.status}`);
  }
  return { token: body.id_token, expiresAt: Date.now() + Number(body.expires_in) * 1000 };
}

export function idToken({ force = false } = {}) {
  if (!authConfigured) {
    return Promise.reject(new Error('Set VITE_FIREBASE_API_KEY + VITE_FIREBASE_REFRESH_TOKEN, or VITE_FIREBASE_ID_TOKEN, in .env.local'));
  }
  if (!(apiKey && refreshToken)) return Promise.resolve(fixedIdToken);
  if (!force && cached && cached.expiresAt - refreshMargin > Date.now()) {
    return Promise.resolve(cached.token);
  }
  pending ??= exchange()
    .then((fresh) => (cached = fresh).token)
    .finally(() => (pending = null));
  return pending;
}
