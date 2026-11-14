const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (value) => String(value).padStart(2, '0');

function dayDiff(date) {
  const start = (value) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  return Math.round((start(new Date()) - start(date)) / 86_400_000);
}

export function day(iso) {
  if (!iso) return '—';
  const date = new Date(iso);
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

export function time(iso, seconds = false) {
  const date = new Date(iso);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}${seconds ? `:${pad(date.getSeconds())}` : ''}`;
}

export function when(iso, { seconds = false, timeAlways = false } = {}) {
  if (!iso) return '—';
  const date = new Date(iso);
  const diff = dayDiff(date);
  if (diff === 0) return `Today, ${time(iso, seconds)}`;
  if (diff === 1) return `Yesterday, ${time(iso, seconds)}`;
  if (!timeAlways && !seconds) return day(iso);
  const label = date.getFullYear() === new Date().getFullYear() ? `${date.getDate()} ${months[date.getMonth()]}` : day(iso);
  return `${label}, ${time(iso, seconds)}`;
}

export function sameDay(iso, reference) {
  if (!iso) return '—';
  if (reference && new Date(iso).toDateString() === new Date(reference).toDateString()) return time(iso);
  return when(iso, { timeAlways: true });
}

export function relative(iso) {
  if (!iso) return '—';
  const seconds = (Date.now() - Date.parse(iso)) / 1000;
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`;
  }
  if (seconds < 86_400 && dayDiff(new Date(iso)) === 0) {
    const hours = Math.floor(seconds / 3600);
    return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  }
  if (dayDiff(new Date(iso)) === 1) return 'Yesterday';
  return day(iso);
}

export function size(bytes) {
  if (bytes == null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

export function duration(seconds) {
  if (seconds == null || !Number.isFinite(seconds)) return '—';
  const total = Math.max(0, Math.round(seconds));
  if (total < 60) return `${total} s`;
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  if (hours > 0) return minutes ? `${hours} h ${minutes} min` : `${hours} h`;
  return rest ? `${minutes} min ${rest} s` : `${minutes} min`;
}

export function limit(seconds) {
  if (seconds == null) return '—';
  return seconds >= 60 ? `${seconds} s (${duration(seconds)})` : `${seconds} s`;
}

export const elapsed = (from, to, now = Date.now()) => (from ? ((to ? Date.parse(to) : now) - Date.parse(from)) / 1000 : null);

export function shortHash(hex) {
  if (!hex) return '—';
  return hex.length > 12 ? `${hex.slice(0, 4)}…${hex.slice(-4)}` : hex;
}

export function midHash(hex) {
  if (!hex) return '—';
  return hex.length > 20 ? `${hex.slice(0, 8)}…${hex.slice(-8)}` : hex;
}

export const jobLabel = (id) => `#${String(id ?? '').slice(0, 8)}`;

export function number(value, digits = 4) {
  if (value == null || !Number.isFinite(value)) return '—';
  const rounded = Number(value.toPrecision(digits));
  return rounded.toLocaleString('en-US', { maximumFractionDigits: 6 });
}

export const dims = (x, y, z) => `${number(x)} × ${number(y)} × ${number(z)}`;

export const plural = (count, one, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

export function nameOf(person) {
  if (!person) return '';
  return person.displayName?.trim() || person.username || '';
}

export const isDeletedUser = (person) => person?.status === 'DELETED' || /^deleted-/.test(person?.username ?? '');

export function initials(person) {
  if (isDeletedUser(person)) return '?';
  const name = nameOf(person);
  const words = name.split(/[\s._-]+/).filter(Boolean);
  const letters = words.length > 1 ? words[0][0] + words[1][0] : name.slice(0, 2);
  return letters.toUpperCase() || '?';
}

const stickers = ['sky', 'orange', 'purple', 'pink', 'teal', 'green', 'brown'];

function hash(text) {
  let value = 0;
  for (const char of String(text ?? '')) value = (value * 31 + char.charCodeAt(0)) >>> 0;
  return value;
}

export const sticker = (seed) => `pk-sticker-${stickers[hash(seed) % stickers.length]}`;

export const letterOf = (name) => (name?.trim()?.[0] ?? '?').toUpperCase();

const palette = ['#62aef0', '#dd5b00', '#d6b6f6', '#2a9d99', '#ff64c8', '#1aae39', '#e8b04a', '#8a6df0', '#523410', '#f07a7a'];

export function modelColor(index) {
  if (index < palette.length) return palette[index];
  const hue = Math.round(((index * 0.618034) % 1) * 360);
  return `hsl(${hue} 60% 58%)`;
}

export const permissions = [
  { value: 'OWNER', label: 'Owner' },
  { value: 'WRITE', label: 'Can edit' },
  { value: 'READ', label: 'Can view' }
];

export const permissionLabel = (value) => permissions.find((entry) => entry.value === value)?.label ?? value ?? '—';

const rank = { READ: 1, WRITE: 2, OWNER: 3 };
export const allows = (permission, needed) => (rank[permission] ?? 0) >= rank[needed];

const formatLabels = { THREE_MF: '3MF', GLTF: 'glTF' };
export const formatLabel = (format) => formatLabels[format] ?? format ?? '—';

export function startOfDay(value) {
  if (!value) return undefined;
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d).toISOString();
}

export function dayAfter(value) {
  if (!value) return undefined;
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d + 1).toISOString();
}
