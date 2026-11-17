// Shapes of the backend's JSON (see 3d-packing-backend/api/**/ *Response.java).

export type Permission = 'READ' | 'WRITE' | 'OWNER';
export type ProjectStatus = 'ACTIVE' | 'DISABLED';
export type ModelFormat = 'STL' | 'OBJ' | 'STEP' | 'THREE_MF' | 'PLY' | 'GLTF' | 'GLB';
export type FileStatus = 'AVAILABLE' | 'DELETED';
export type JobStatus = 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
export type PreviewQuality = 'LOW' | 'MEDIUM' | 'HIGH';
export type PreviewStatus = 'NONE' | 'PENDING' | 'READY' | 'FAILED';
export type DraftSource = 'SELECTED_JOB' | 'LAST_OWN_JOB' | 'LAST_PROJECT_JOB' | 'DEFAULTS';
export type SortDirection = 'ASC' | 'DESC';

export interface PageOf<T> {
	content: T[];
	page: number;
	size: number;
	totalElements: number;
	totalPages: number;
}

export interface User {
	id: string;
	email: string;
	username: string;
	displayName: string | null;
	role: string;
	status: string;
	createdAt: string;
	updatedAt: string;
	lastLoginAt: string | null;
}

export interface ProjectSummary {
	id: string;
	name: string;
	status: ProjectStatus;
	myPermission: Permission;
	memberCount: number;
	createdAt: string;
	updatedAt: string;
}

export interface Project {
	id: string;
	name: string;
	status: ProjectStatus;
	createdBy: string;
	myPermission: Permission;
	createdAt: string;
	updatedAt: string;
}

export interface ProjectFile {
	id: string;
	projectId: string;
	filename: string;
	format: ModelFormat;
	/** What the engine receives: OBJ for an OBJ upload or a converted model, null when it cannot be packed. */
	packingFormat: ModelFormat | null;
	contentType: string;
	sizeBytes: number;
	checksumSha256: string;
	status: FileStatus;
	createdAt: string;
}

export interface SampleModel {
	id: string;
	name: string;
	description: string;
	filename: string;
	format: ModelFormat;
	sizeBytes: number;
}

export interface JobItem {
	fileId: string;
	fileName?: string;
	copies: number;
}

export interface JobInput {
	schemaVersion?: number;
	maxRuntimeSeconds: number;
	parameters: Record<string, unknown>;
	items: JobItem[];
}

export interface PreviewModel {
	quality: PreviewQuality;
	triangles: number;
	sizeBytes: number;
}

export interface ResultBin {
	number: number;
	sizeBytes: number;
	checksum: string;
	previews: PreviewModel[];
}

export interface PackingJob {
	id: string;
	projectId: string;
	status: JobStatus;
	engineVersion: string | null;
	engineChecksum: string | null;
	createdAt: string;
	startedAt: string | null;
	finishedAt: string | null;
	failureReason: string | null;
	resultFileName: string | null;
	resultContentType: string | null;
	resultSizeBytes: number | null;
	resultChecksum: string | null;
	resultBins: ResultBin[];
	input: JobInput | null;
	preview: { status: PreviewStatus; models: PreviewModel[] };
}

export interface JobDraft {
	source: DraftSource;
	sourceJobId: string | null;
	input: JobInput;
	omittedItems: { fileId: string; fileName: string }[];
	resetFields: string[];
}

/** RFC 7807 problem detail, as the API's error handler writes it. */
export interface Problem {
	title?: string;
	detail?: string;
	status?: number;
	errors?: unknown[];
}
