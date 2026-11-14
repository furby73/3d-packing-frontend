export const toasts = $state([]);

let next = 1;

function push(tone, message, action, timeout = 5000) {
  if (!message) return;
  const id = next++;
  toasts.push({ id, tone, message, action });
  if (timeout) setTimeout(() => dismiss(id), timeout);
}

export function dismiss(id) {
  const index = toasts.findIndex((entry) => entry.id === id);
  if (index >= 0) toasts.splice(index, 1);
}

export const toast = {
  success: (message, action) => push('success', message, action),
  info: (message, action) => push('info', message, action),
  warning: (message, action) => push('warning', message, action, 7000),
  error: (message, action) => push('error', message, action, 8000)
};

export function failed(error, fallback = 'Something went wrong') {
  if (error?.name === 'AbortError') return;
  if (error?.status === 401) return;
  const message = refusal(error) ?? error?.message ?? fallback;
  if (error?.status === 409 && /disabled|archived/i.test(message)) toast.warning(message);
  else toast.error(message);
}

export function refusal(error) {
  if (!error) return null;
  if (error.status === 403) return error.problem?.detail ?? 'You do not have permission to do that';
  if (error.status === 409 && error.concurrentUpdate) return 'Someone else changed this — refresh and try again';
  return null;
}

export async function copy(text, label = 'Copied') {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(label);
  } catch {
    toast.error('Could not copy to the clipboard');
  }
}
