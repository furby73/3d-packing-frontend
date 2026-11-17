import { api } from './api/client';
import type { PackingJob } from './api/types';

// The API identifies jobs by UUID; the design shows "Run 12". A run's number is
// 1 + the number of jobs created before it in the same project, which never changes.
const cache = new Map<string, number>();

export async function runNumber(projectId: string, job: Pick<PackingJob, 'id' | 'createdAt'>) {
	const known = cache.get(job.id);
	if (known) return known;
	const earlier = await api.jobs(projectId, { size: 1, createdBefore: job.createdAt });
	const number = earlier.totalElements + 1;
	cache.set(job.id, number);
	return number;
}

/** Numbers for a page of jobs; looks up only the ones not seen before. */
export async function runNumbers(projectId: string, jobs: PackingJob[]) {
	const entries = await Promise.all(
		jobs.map(async (job) => [job.id, await runNumber(projectId, job)] as const)
	);
	return Object.fromEntries(entries) as Record<string, number>;
}

export const runLabel = (number: number | undefined) => (number ? `Run ${number}` : 'Run');
