export const route = $state({ path: location.pathname, search: location.search });

function sync() {
  route.path = location.pathname;
  route.search = location.search;
}

window.addEventListener('popstate', sync);

export function navigate(to, { replace = false } = {}) {
  const target = new URL(to, location.origin);
  if (target.pathname + target.search === location.pathname + location.search) return;
  history[replace ? 'replaceState' : 'pushState'](null, '', target.pathname + target.search + target.hash);
  sync();
  if (!replace) window.scrollTo(0, 0);
}

export function queryParam(name) {
  return new URLSearchParams(route.search).get(name);
}

export function setQuery(values) {
  const params = new URLSearchParams(location.search);
  for (const [key, value] of Object.entries(values)) {
    if (value == null || value === '') params.delete(key);
    else params.set(key, value);
  }
  const text = params.toString();
  navigate(location.pathname + (text ? `?${text}` : ''), { replace: true });
}

export function match(pattern, path) {
  const want = pattern.split('/').filter(Boolean);
  const have = path.split('/').filter(Boolean);
  if (want.length !== have.length) return null;
  const params = {};
  for (let i = 0; i < want.length; i++) {
    if (want[i].startsWith(':')) params[want[i].slice(1)] = decodeURIComponent(have[i]);
    else if (want[i] !== have[i]) return null;
  }
  return params;
}

export function interceptLinks(event) {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    return;
  }
  const anchor = event.target.closest?.('a[href]');
  if (!anchor || anchor.target || anchor.hasAttribute('download') || anchor.dataset.external != null) return;
  const url = new URL(anchor.href, location.href);
  if (url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  event.preventDefault();
  if (url.pathname === location.pathname && url.search === location.search && url.hash) {
    location.hash = url.hash;
    return;
  }
  navigate(url.pathname + url.search + url.hash);
}
