# 3d-packing-frontend

The web app for the 3D Packing platform: projects, 3D model files, packing jobs and their results, members and roles. Svelte 5 + Vite, three.js for the viewer, Firebase Authentication for sign-in. It talks only to the backend's REST API (`/api/v1`, see `https://3dpacking.dev/swagger-ui/index.html`).

## Screens

| Route | Screen |
| --- | --- |
| `/` | Projects you are a member of: search, filters, sort, new project, row actions |
| `/projects/:id/files` | Upload (drag and drop, one file at a time), sample models, file table, 3D preview drawer (`?file=<id>`) |
| `/projects/:id/jobs` | Packing jobs with status filters; refreshes every 5 s while a job is queued or running |
| `/projects/:id/jobs/new` | New job, prefilled from the backend draft (`?from=<jobId>` for Run again); engine options are rendered from the input schema |
| `/projects/:id/jobs/:jobId` | Live status, 3D result (glTF previews or the full OBJ), one container at a time or side by side, per-container downloads |
| `/projects/:id/members` | Members and permissions, add people through user search |
| `/projects/:id/settings` | Rename, archive or re-activate, delete (Owners only) |
| `/profile` | Username and display name, sign-in method and password reset, theme, delete account |
| `/admin/users` | Change a person's global role (Admins only) |

Multi-container results: the engine fills as few containers as it can. The combined OBJ places containers side by side along X with a stride of `width + max(gap, width × 0.1)`; the viewer uses that to outline each container, count its parts and focus one. Each container is also downloadable on its own (`/result/bins/{n}`).

## Sign-in

Firebase owns sign-in; the backend never sees a password. The app offers Google and email/password (with password reset), and the backend provisions the profile on the first `GET /api/v1/users/me`. A disabled account is recognised from the API's `WWW-Authenticate` header and gets its own screen.

The Firebase web config is public by design. For local development:

```bash
cp .env.example .env.local
# VITE_FIREBASE_API_KEY      Firebase Console -> Project settings -> General -> Web API Key
# VITE_FIREBASE_AUTH_DOMAIN  packing-3d-6a9e6.firebaseapp.com
# VITE_FIREBASE_PROJECT_ID   packing-3d-6a9e6
```

Only the API key is required; without an auth domain it falls back to `<projectId>.firebaseapp.com`, and Google sign-in needs one of the two. The host serving the app must be listed under Authentication → Settings → Authorised domains (`localhost` is by default).

A served `/config.js` overrides `.env.local` at runtime: `window.APP_CONFIG = {"firebaseApiKey": "...", "firebaseAuthDomain": "...", "firebaseProjectId": "..."}`. The image ships an empty one and the cluster mounts the real one, so one image runs anywhere.

## Development

Local Node is too old for Vite 8, so everything runs in Docker:

```bash
docker run --rm -v "$PWD":/app -w /app node:22-alpine npm install
docker run --rm -it -p 3000:3000 -e API_PROXY=https://3dpacking.dev -e WATCH_POLLING=1 -v "$PWD":/app -w /app node:22-alpine npx vite --host
docker build -t packing-frontend:local .
```

`API_PROXY` is where `/api` goes (default `http://localhost:8080`); `WATCH_POLLING=1` makes file changes reach the dev server through a Windows bind mount. Result and file downloads follow the API's redirect to Blob storage, which needs a `packingsa` CORS rule for the page's origin (`http://localhost:8080`, `http://localhost:3000`, `https://3dpacking.dev`).

In the cluster the Gateway routes `/api/*` to the backend and `/` here, so the browser calls the API same-origin. nginx falls back to `index.html`, so every route above can be opened directly.

Pushing to `main` builds `ghcr.io/furby73/3d-packing-frontend:main-<short sha>` (`.github/workflows/image.yml`); the deploy repo pins that tag.
