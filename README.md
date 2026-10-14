# 3d-packing-frontend

Hello-world Svelte + Vite + three.js frontend: a rotating cube and the HTTP status of `GET /api/v1/users/me`.

Local Node is too old for Vite 8, so everything runs in Docker:

```bash
docker run --rm -v "$PWD":/app -w /app node:22-alpine npm install
docker build -t packing-frontend:local .
docker run --rm -p 3000:8080 packing-frontend:local
```

In the cluster the Gateway routes `/api/*` to the backend and `/` here, so the browser calls the API same-origin.
