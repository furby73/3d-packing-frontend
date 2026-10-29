# 3d-packing-frontend

Packing test bench: pick `.obj` models, set copies and a time limit, submit a packing job, watch it run and preview the packed result with three.js. Everything happens in one project, `Packing test bench`, created on first load.

There is no login. The app signs in with a hardcoded Firebase refresh token and exchanges it for ID tokens itself:

```bash
cp .env.example .env.local
# VITE_FIREBASE_API_KEY       Firebase Console -> Project settings -> General -> Web API Key
# VITE_FIREBASE_REFRESH_TOKEN backend's scripts/Get-FirebaseToken.ps1 -SetEnv, then $env:REFRESH_TOKEN
```

Without a refresh token, `VITE_FIREBASE_ID_TOKEN` is used as-is; it expires an hour after it was minted.

`.env.local` is gitignored but **is baked into the bundle**, including the Docker image: never push an image built with it.

Local Node is too old for Vite 8, so everything runs in Docker:

```bash
docker run --rm -v "$PWD":/app -w /app node:22-alpine npm install
docker run --rm -it -p 3000:3000 -e API_PROXY=http://host.docker.internal:8080 -v "$PWD":/app -w /app node:22-alpine npx vite --host
docker build -t packing-frontend:local .
```

In the cluster the Gateway routes `/api/*` to the backend and `/` here, so the browser calls the API same-origin. Result downloads follow the API's redirect to Blob storage, which needs the `packingsa` CORS rule for `http://localhost:8080` and `http://localhost:3000`.
