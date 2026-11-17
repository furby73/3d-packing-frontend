import { idToken } from '../auth.svelte';
import type {
	JobDraft,
	JobInput,
	JobStatus,
	ModelFormat,
	PackingJob,
	PageOf,
	PreviewQuality,
	Problem,
	Project,
	ProjectFile,
	ProjectStatus,
	ProjectSummary,
	SampleModel,
	SortDirection,
	User
} from './types';

const base = '/api/v1';

export class ApiError extends Error {
	constructor(
		readonly status: number,
		readonly problem: Problem | null
	) {
		super(describe(status, problem));
	}
}

function describe(status: number, problem: Problem | null): string {
	const fallback =
		status === 401
			? 'Your session has expired. Sign in again.'
			: status === 403
				? 'You do not have access to this.'
				: status === 404
					? 'Not found. It may have been deleted.'
					: `Request failed (HTTP ${status}).`;
	const detail = problem?.detail ?? problem?.title ?? fallback;
	const errors = Array.isArray(problem?.errors) ? problem.errors.map(describeError) : [];
	return [detail, ...errors].join(' · ');
}

function describeError(error: unknown): string {
	if (typeof error === 'string') return error;
	const e = error as Record<string, string | undefined>;
	const where = e.field ?? e.pointer ?? e.path ?? e.location;
	const message = e.message ?? e.detail ?? JSON.stringify(error);
	return where ? `${where}: ${message}` : message;
}

/** Message for any error a page shows to the user. */
export const errorMessage = (error: unknown) =>
	error instanceof Error ? error.message : String(error);

async function request(path: string, init: RequestInit = {}, retried = false): Promise<Response> {
	const token = await idToken({ force: retried });
	const response = await fetch(base + path, {
		...init,
		headers: { ...init.headers, Authorization: `Bearer ${token}` }
	});
	// A cached token can expire mid-session; refresh it once before giving up.
	if (response.status === 401 && !retried) return request(path, init, true);
	if (!response.ok) {
		throw new ApiError(response.status, await response.json().catch(() => null));
	}
	return response;
}

const json = async <T>(path: string, init?: RequestInit): Promise<T> =>
	(await request(path, init)).json() as Promise<T>;

const send = (method: string, body?: unknown): RequestInit => ({
	method,
	headers: { 'Content-Type': 'application/json' },
	body: body === undefined ? undefined : JSON.stringify(body)
});

type QueryValue = string | number | boolean | undefined | null | readonly (string | number)[];

/** Builds a query string, repeating array values (`status=A&status=B`) and skipping empty ones. */
function query(params: Record<string, QueryValue>): string {
	const search = new URLSearchParams();
	for (const [key, value] of Object.entries(params)) {
		if (value === undefined || value === null || value === '') continue;
		if (Array.isArray(value)) value.forEach((v) => search.append(key, String(v)));
		else search.append(key, String(value));
	}
	const text = search.toString();
	return text ? `?${text}` : '';
}

/** The API rejects searches shorter than 3 characters, so shorter input means "no filter". */
const searchTerm = (text: string | undefined) => {
	const trimmed = text?.trim() ?? '';
	return trimmed.length >= 3 ? trimmed : undefined;
};

export interface ListParams {
	page?: number;
	size?: number;
	search?: string;
	sort?: string;
	direction?: SortDirection;
}

const p = encodeURIComponent;

export const api = {
	me: () => json<User>('/users/me'),

	projects: (params: ListParams & { status?: ProjectStatus[] } = {}) =>
		json<PageOf<ProjectSummary>>(
			`/projects${query({ ...params, search: searchTerm(params.search) })}`
		),
	project: (projectId: string) => json<Project>(`/projects/${p(projectId)}`),
	createProject: (name: string) => json<Project>('/projects', send('POST', { name })),
	renameProject: (projectId: string, name: string) =>
		json<Project>(`/projects/${p(projectId)}`, send('PATCH', { name })),

	files: (projectId: string, params: ListParams & { format?: ModelFormat[] } = {}) =>
		json<PageOf<ProjectFile>>(
			`/projects/${p(projectId)}/files${query({ ...params, search: searchTerm(params.search) })}`
		),
	upload: (projectId: string, file: File) => {
		const form = new FormData();
		form.append('file', file);
		return json<ProjectFile>(`/projects/${p(projectId)}/files`, { method: 'POST', body: form });
	},
	renameFile: (projectId: string, fileId: string, name: string) =>
		json<ProjectFile>(`/projects/${p(projectId)}/files/${p(fileId)}`, send('PATCH', { name })),
	deleteFile: (projectId: string, fileId: string) =>
		request(`/projects/${p(projectId)}/files/${p(fileId)}`, { method: 'DELETE' }),
	fileContent: async (projectId: string, fileId: string) =>
		(await request(`/projects/${p(projectId)}/files/${p(fileId)}/content`)).blob(),

	samples: () => json<SampleModel[]>('/sample-models'),
	addSample: (projectId: string, sampleId: string) =>
		json<ProjectFile>(`/projects/${p(projectId)}/files/samples`, send('POST', { sampleId })),

	inputSchema: () => json<JsonSchema>('/packing/input-schema'),

	jobs: (
		projectId: string,
		params: ListParams & { status?: JobStatus[]; createdBefore?: string } = {}
	) => json<PageOf<PackingJob>>(`/projects/${p(projectId)}/packing-jobs${query({ ...params })}`),
	job: (projectId: string, jobId: string) =>
		json<PackingJob>(`/projects/${p(projectId)}/packing-jobs/${p(jobId)}`),
	draft: (projectId: string, from?: string) =>
		json<JobDraft>(`/projects/${p(projectId)}/packing-jobs/draft${query({ from })}`),
	createJob: (projectId: string, input: JobInput) =>
		json<PackingJob>(`/projects/${p(projectId)}/packing-jobs`, send('POST', input)),
	cancelJob: (projectId: string, jobId: string) =>
		json<PackingJob>(`/projects/${p(projectId)}/packing-jobs/${p(jobId)}/cancel`, {
			method: 'POST'
		}),

	// Downloads answer with a redirect to short-lived Blob storage URLs; fetch follows it.
	result: async (projectId: string, jobId: string) =>
		(await request(`/projects/${p(projectId)}/packing-jobs/${p(jobId)}/result`)).blob(),
	resultBin: async (projectId: string, jobId: string, bin: number) =>
		(await request(`/projects/${p(projectId)}/packing-jobs/${p(jobId)}/result/bins/${bin}`)).blob(),
	preview: async (projectId: string, jobId: string, quality: PreviewQuality) =>
		(
			await request(`/projects/${p(projectId)}/packing-jobs/${p(jobId)}/preview/${quality}`)
		).arrayBuffer(),
	binPreview: async (projectId: string, jobId: string, bin: number, quality: PreviewQuality) =>
		(
			await request(
				`/projects/${p(projectId)}/packing-jobs/${p(jobId)}/result/bins/${bin}/preview/${quality}`
			)
		).arrayBuffer()
};

/** Minimal JSON Schema shape, enough to render the job form. */
export interface JsonSchema {
	type?: string;
	title?: string;
	description?: string;
	default?: unknown;
	enum?: unknown[];
	minimum?: number;
	maximum?: number;
	exclusiveMinimum?: number;
	exclusiveMaximum?: number;
	minItems?: number;
	maxItems?: number;
	properties?: Record<string, JsonSchema>;
	items?: JsonSchema;
	'x-unit'?: string;
	'x-widget'?: string;
	'x-acceptedFormats'?: ModelFormat[];
	'x-maxTotalCopies'?: number;
}

/** Saves a downloaded blob under the given name. */
export function saveBlob(blob: Blob, name: string) {
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = name;
	document.body.append(link);
	link.click();
	link.remove();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}
