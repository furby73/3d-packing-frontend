import { idToken } from './firebase.js';

const base = '/api/v1';
const rejectedListeners = new Set();

export function onSessionRejected(listener) {
  rejectedListeners.add(listener);
  return () => rejectedListeners.delete(listener);
}

export class ApiError extends Error {
  constructor(status, problem, accountState = null) {
    super(describe(status, problem));
    this.status = status;
    this.problem = problem;
    this.accountState = accountState;
    this.fieldErrors = fieldErrorsOf(problem);
  }

  get conflict() {
    return this.status === 409;
  }

  get concurrentUpdate() {
    return this.status === 409 && this.problem?.title === 'Conflicting update';
  }
}

function describe(status, problem) {
  if (problem?.detail) return problem.detail;
  if (problem?.title) return problem.title;
  if (status === 0) return 'Could not reach the server. Check your connection.';
  if (status === 401) return 'Your session was rejected. Sign in again.';
  if (status === 403) return 'You do not have permission to do that.';
  if (status === 404) return 'Not found.';
  if (status >= 500) return 'The server had a problem. Try again in a moment.';
  return `Request failed (HTTP ${status})`;
}

function fieldErrorsOf(problem) {
  const errors = problem?.errors;
  if (!errors) return {};
  if (Array.isArray(errors)) {
    return Object.fromEntries(
      errors.map((error, index) =>
        typeof error === 'string'
          ? [String(index), error]
          : [error.field ?? error.pointer ?? error.path ?? String(index), error.message ?? error.detail ?? '']
      )
    );
  }
  return { ...errors };
}

function accountStateOf(response) {
  const header = response.headers.get('WWW-Authenticate') ?? '';
  const match = header.match(/account for this token is (\w+)/i);
  return match ? match[1].toLowerCase() : null;
}

async function failure(response) {
  const problem = await response.json().catch(() => null);
  return new ApiError(response.status, problem, response.status === 401 ? accountStateOf(response) : null);
}

function query(params = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === '') continue;
    if (Array.isArray(value)) value.forEach((item) => search.append(key, item));
    else search.append(key, value);
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

async function request(path, { method = 'GET', params, json, body, signal } = {}, retried = false) {
  const token = await idToken({ force: retried });
  const headers = { Authorization: `Bearer ${token}` };
  if (json !== undefined) headers['Content-Type'] = 'application/json';
  let response;
  try {
    response = await fetch(base + path + query(params), {
      method,
      headers,
      body: json !== undefined ? JSON.stringify(json) : body,
      signal
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    throw new ApiError(0, null);
  }
  if (response.status === 401 && !retried) return request(path, { method, params, json, body, signal }, true);
  if (!response.ok) {
    const error = await failure(response);
    if (error.status === 401) rejectedListeners.forEach((listener) => listener(error));
    throw error;
  }
  return response;
}

const json = async (path, init) => (await request(path, init)).json();
const none = async (path, init) => {
  await request(path, init);
};
const blob = async (path, init) => (await request(path, init)).blob();
const buffer = async (path, init) => (await request(path, init)).arrayBuffer();

function upload(path, file, { onProgress, signal } = {}, retried = false) {
  return idToken({ force: retried }).then(
    (token) =>
      new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', base + path);
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        xhr.responseType = 'json';
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) onProgress?.(event.loaded / event.total);
        };
        xhr.onload = () => {
          if (xhr.status === 401 && !retried) {
            upload(path, file, { onProgress, signal }, true).then(resolve, reject);
          } else if (xhr.status >= 200 && xhr.status < 300) {
            resolve(xhr.response);
          } else {
            reject(new ApiError(xhr.status, xhr.response));
          }
        };
        xhr.onerror = () => reject(new ApiError(0, null));
        xhr.onabort = () => reject(new DOMException('Upload cancelled', 'AbortError'));
        signal?.addEventListener('abort', () => xhr.abort(), { once: true });
        const form = new FormData();
        form.append('file', file);
        xhr.send(form);
      })
  );
}

const enc = encodeURIComponent;
const project = (projectId) => `/projects/${enc(projectId)}`;
const job = (projectId, jobId) => `${project(projectId)}/packing-jobs/${enc(jobId)}`;

export const api = {
  me: () => json('/users/me'),
  updateMe: (username, displayName) => json('/users/me', { method: 'PATCH', json: { username, displayName } }),
  deleteMe: () => none('/users/me', { method: 'DELETE' }),
  searchUsers: (pattern, limit = 10, signal) => json('/users/search', { params: { pattern, limit }, signal }),
  assignRole: (userId, role) => json(`/users/${enc(userId)}/role`, { method: 'PUT', json: { role } }),

  projects: (params) => json('/projects', { params }),
  createProject: (name) => json('/projects', { method: 'POST', json: { name } }),
  project: (projectId) => json(project(projectId)),
  renameProject: (projectId, name) => json(project(projectId), { method: 'PATCH', json: { name } }),
  disableProject: (projectId) => none(`${project(projectId)}/disable`, { method: 'POST' }),
  activateProject: (projectId) => none(`${project(projectId)}/activate`, { method: 'POST' }),
  deleteProject: (projectId) => none(project(projectId), { method: 'DELETE' }),

  members: (projectId, params) => json(`${project(projectId)}/members`, { params }),
  addMember: (projectId, userId, permission) =>
    json(`${project(projectId)}/members`, { method: 'POST', json: { userId, permission } }),
  changeMember: (projectId, userId, permission) =>
    json(`${project(projectId)}/members/${enc(userId)}`, { method: 'PATCH', json: { permission } }),
  removeMember: (projectId, userId) => none(`${project(projectId)}/members/${enc(userId)}`, { method: 'DELETE' }),

  files: (projectId, params) => json(`${project(projectId)}/files`, { params }),
  upload: (projectId, file, options) => upload(`${project(projectId)}/files`, file, options),
  renameFile: (projectId, fileId, name) =>
    json(`${project(projectId)}/files/${enc(fileId)}`, { method: 'PATCH', json: { name } }),
  deleteFile: (projectId, fileId) => none(`${project(projectId)}/files/${enc(fileId)}`, { method: 'DELETE' }),
  fileBlob: (projectId, fileId) => blob(`${project(projectId)}/files/${enc(fileId)}/content`),
  fileBuffer: (projectId, fileId) => buffer(`${project(projectId)}/files/${enc(fileId)}/content`),

  samples: () => json('/sample-models'),
  sampleBuffer: (sampleId) => buffer(`/sample-models/${enc(sampleId)}/content`),
  addSample: (projectId, sampleId) => json(`${project(projectId)}/files/samples`, { method: 'POST', json: { sampleId } }),

  inputSchema: () => json('/packing/input-schema'),
  jobs: (projectId, params) => json(`${project(projectId)}/packing-jobs`, { params }),
  job: (projectId, jobId) => json(job(projectId, jobId)),
  draft: (projectId, from) => json(`${project(projectId)}/packing-jobs/draft`, { params: { from } }),
  createJob: (projectId, input) => json(`${project(projectId)}/packing-jobs`, { method: 'POST', json: input }),
  cancelJob: (projectId, jobId) => json(`${job(projectId, jobId)}/cancel`, { method: 'POST' }),
  resultBlob: (projectId, jobId) => blob(`${job(projectId, jobId)}/result`),
  resultBuffer: (projectId, jobId) => buffer(`${job(projectId, jobId)}/result`),
  binBlob: (projectId, jobId, number) => blob(`${job(projectId, jobId)}/result/bins/${number}`),
  previewBuffer: (projectId, jobId, quality) => buffer(`${job(projectId, jobId)}/preview/${quality}`),
  binPreviewBuffer: (projectId, jobId, number, quality) => buffer(`${job(projectId, jobId)}/result/bins/${number}/preview/${quality}`)
};
