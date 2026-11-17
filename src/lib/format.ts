import type { JobInput, JobStatus, PackingJob, Permission } from './api/types';

const units = ['B', 'KB', 'MB', 'GB'];

export function bytes(size: number | null | undefined): string {
	if (size == null) return '–';
	let value = size;
	let unit = 0;
	while (value >= 1024 && unit < units.length - 1) {
		value /= 1024;
		unit++;
	}
	return `${unit === 0 ? value : value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
}

const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });
const timeSeconds = new Intl.DateTimeFormat('en-GB', {
	hour: '2-digit',
	minute: '2-digit',
	second: '2-digit'
});
const date = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** "today, 10:41", "yesterday, 16:20", "3 days ago", "last month" or a date, like the design. */
export function when(iso: string | null | undefined, { seconds = false, withTime = true } = {}) {
	if (!iso) return '–';
	const d = new Date(iso);
	const clock = (seconds ? timeSeconds : time).format(d);
	const days = Math.round((startOfDay(new Date()) - startOfDay(d)) / 86_400_000);
	if (days <= 0) return withTime ? `today, ${clock}` : 'today';
	if (days === 1) return withTime ? `yesterday, ${clock}` : 'yesterday';
	if (days < 7) return `${days} days ago`;
	if (days < 31) return `${Math.round(days / 7)} week${days < 11 ? '' : 's'} ago`;
	if (days < 62) return 'last month';
	return date.format(d);
}

export const clock = (iso: string | null | undefined, seconds = false) =>
	iso ? (seconds ? timeSeconds : time).format(new Date(iso)) : '–';

/** Whole seconds between two timestamps, or until now when `to` is missing. */
export function secondsBetween(
	from: string | null | undefined,
	to?: string | null,
	now = Date.now()
) {
	if (!from) return null;
	const end = to ? new Date(to).getTime() : now;
	return Math.max(0, Math.round((end - new Date(from).getTime()) / 1000));
}

export function duration(seconds: number | null | undefined): string {
	if (seconds == null) return '-';
	if (seconds < 120) return `${seconds} s`;
	const m = Math.floor(seconds / 60);
	const s = seconds % 60;
	if (m < 60) return s ? `${m} min ${s} s` : `${m} min`;
	return `${Math.floor(m / 60)} h ${m % 60} min`;
}

export const jobDuration = (job: PackingJob) => secondsBetween(job.startedAt, job.finishedAt);

export const totalCopies = (input: JobInput | null | undefined) =>
	input?.items.reduce((sum, item) => sum + (item.copies ?? 0), 0) ?? 0;

export const isActive = (status: JobStatus) => status === 'QUEUED' || status === 'RUNNING';

export const canWrite = (permission: Permission | undefined) =>
	permission === 'WRITE' || permission === 'OWNER';

const modelColors = ['#c8793f', '#5fa8d3', '#6fcf97', '#c792ea', '#e6c35c'];

/** Model swatch colour: the five design colours first, then golden-angle hues. */
export function modelColor(index: number): string {
	if (index < modelColors.length) return modelColors[index];
	const hue = Math.round((index * 137.508) % 360);
	return `hsl(${hue} 55% 62%)`;
}

export const plural = (count: number, word: string, many = `${word}s`) =>
	`${count} ${count === 1 ? word : many}`;
