# 3d-packing-frontend

Packing test bench: pick `.obj` models, set copies, a time limit and the container size (plus gap, algorithm and seed), submit a packing job, watch it run and preview the packed result with three.js. The engine fills as few containers as it can; when it needs more than one, the preview shows them side by side and each container's OBJ can be downloaded on its own. The defaults come from the backend's input schema. Everything happens in one project, `Packing test bench`, created on first load.

Sign in with a Firebase email/password account, or create one from the form; the backend provisions its profile on the first `/api/v1/users/me`. The Firebase web config is public by design:

```bash
cp .env.example .env.local
# VITE_FIREBASE_API_KEY      Firebase Console -> Project settings -> General -> Web API Key
# VITE_FIREBASE_AUTH_DOMAIN  packing-3d-6a9e6.firebaseapp.com
# VITE_FIREBASE_PROJECT_ID   packing-3d-6a9e6
```

A served `/config.js` overrides `.env.local` at runtime: `window.APP_CONFIG = {"firebaseApiKey": "...", "firebaseAuthDomain": "...", "firebaseProjectId": "..."}`. The image ships an empty one and the GCP cluster mounts the real one, so one image runs anywhere.

Pushing to `demo` builds `ghcr.io/furby73/3d-packing-frontend:demo-<short sha>` (`.github/workflows/image.yml`); the deploy repo pins that tag.

Local Node is too old for Vite 8, so everything runs in Docker:

```bash
docker run --rm -v "$PWD":/app -w /app node:22-alpine npm install
docker run --rm -it -p 3000:3000 -e API_PROXY=http://host.docker.internal:8080 -v "$PWD":/app -w /app node:22-alpine npx vite --host
docker build -t packing-frontend:local .
```

In the cluster the Gateway routes `/api/*` to the backend and `/` here, so the browser calls the API same-origin. Result downloads follow the API's redirect to Blob storage, which needs a `packingsa` CORS rule for the page's origin (`http://localhost:8080`, `http://localhost:3000`, `https://3dpacking.dev`).
