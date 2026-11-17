# COMPACK frontend (ZPI 3D nesting)

Web app for the 3D nesting platform, built from the Figma design
"ZPI 3D nesting – UI" against the API in `Peczenko/3d-packing-backend`.

**Stack:** SvelteKit 3 (single-page app, `adapter-static`), Svelte 5 runes, TypeScript,
Three.js for the 3D preview, Firebase Authentication (email + password).

## Screens

| Route                       | Design frame                                                                               |
| --------------------------- | ------------------------------------------------------------------------------------------ |
| `/login`                    | 1. Sign in (also create account and password reset)                                        |
| `/`                         | 2. Projects (search, new project)                                                          |
| `/projects/:id`             | 3. Project models (upload, drag-and-drop, rename, delete, download, sample models)         |
| `/projects/:id/runs`        | 8. Run history (status filter, sort, live refresh)                                         |
| `/projects/:id/jobs/new`    | 4. New packing job (prefilled from `/packing-jobs/draft`, `?from=<jobId>` for "Run again") |
| `/projects/:id/jobs/:jobId` | 5. In progress, 6. Result (3D preview, per-container downloads), 7. Failed / cancelled     |

The job form is driven by `GET /api/v1/packing/input-schema`: limits (models, copies, time
limit) and engine options (container size, gap, algorithm, seed) come from the schema, so new
engine options show up without frontend changes.

Run numbers ("Run 12") are not stored by the backend; a run's number is 1 + the number of jobs
created before it in the project (`src/lib/runs.ts`).

## Running locally

Node 22+ (24 recommended).

```bash
npm install
cp .env.example .env.local     # fill in VITE_FIREBASE_API_KEY (Firebase console → Project settings)
npm run dev                    # http://localhost:3000, proxies /api to http://localhost:8080
API_PROXY=https://3dpacking.dev npm run dev   # or point the proxy at another backend
```

Other scripts: `npm run check` (svelte-check + TypeScript), `npm run build` (static site into
`build/`), `npm run format`.

A served `/config.js` overrides `.env.local` at runtime:
`window.APP_CONFIG = { firebaseApiKey, firebaseAuthDomain, firebaseProjectId }`. The image ships
an empty one and the cluster can mount the real one, so one image runs anywhere (same contract
as the old test bench).

## Docker

```bash
docker build -t packing-frontend:local .
docker run --rm -p 8080:8080 packing-frontend:local
```

nginx serves the static build on port 8080 with an SPA fallback; the Gateway routes `/api/*` to
the backend. Result downloads follow the API's redirect to Blob storage, which needs a CORS rule
for the page's origin.

## Layout

```
src/
  app.css                 design tokens (Figma variables) and shared styles
  lib/
    api/client.ts         typed API client (Firebase token, retry on 401, problem details)
    api/types.ts          backend DTOs
    auth.svelte.ts        Firebase session as reactive state
    project.svelte.ts     current project shared by /projects/[projectId]/*
    schema.ts             JSON Schema helpers for the job form
    runs.ts               run numbers
    format.ts             sizes, dates, durations, model colours
    components/           TopBar, Badge, StatusBadge, Modal, Viewer (three.js), SchemaField, ...
  routes/                 pages (see table above)
```
