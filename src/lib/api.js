import { idToken } from './auth.js';

const base = '/api/v1';

export class ApiError extends Error {
  constructor(status, problem) {
    super(describe(status, problem));
    this.status = status;
    this.problem = problem;
  }
}

function describe(status, problem) {
  const fallback = status === 401 ? 'The Firebase ID token was rejected; it may have expired' : `HTTP ${status}`;
  const detail = problem?.detail ?? problem?.title ?? fallback;
  const errors = Array.isArray(problem?.errors) ? problem.errors.map(describeError) : [];
  return [detail, ...errors].join(' · ');
}

function describeError(error) {
  if (typeof error === 'string') return error;
  const where = error.field ?? error.pointer ?? error.path ?? error.location;
  const message = error.message ?? error.detail ?? JSON.stringify(error);
  return where ? `${where}: ${message}` : message;
}

async function request(path, init = {}, retried = false) {
  const token = await idToken({ force: retried });
  const response = await fetch(base + path, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${token}` }
  });
  if (response.status === 401 && !retried) return request(path, init, true);
  if (!response.ok) throw new ApiError(response.status, await response.json().catch(() => null));
  return response;
}

const json = async (path, init) => (await request(path, init)).json();

const send = (method, body) => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body)
});

export const api = {
  me: () => json('/users/me'),
  inputSchema: () => json('/packing/input-schema'),
  activeProjects: (search) => json(`/projects?size=100&status=ACTIVE&search=${encodeURIComponent(search)}`),
  createProject: (name) => json('/projects', send('POST', { name })),
  objFiles: (projectId) => json(`/projects/${projectId}/files?size=100&format=OBJ`),
  upload: (projectId, file) => {
    const form = new FormData();
    form.append('file', file);
    return json(`/projects/${projectId}/files`, { method: 'POST', body: form });
  },
  jobs: (projectId) => json(`/projects/${projectId}/packing-jobs?size=10`),
  createJob: (projectId, input) => json(`/projects/${projectId}/packing-jobs`, send('POST', input)),
  cancelJob: (projectId, jobId) => json(`/projects/${projectId}/packing-jobs/${jobId}/cancel`, { method: 'POST' }),
  result: async (projectId, jobId) =>
    (await request(`/projects/${projectId}/packing-jobs/${jobId}/result`)).blob()
};
