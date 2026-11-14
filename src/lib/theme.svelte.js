const key = 'pk-theme';
const media = window.matchMedia('(prefers-color-scheme: dark)');

export const theme = $state({
  preference: localStorage.getItem(key) ?? 'system',
  resolved: 'light'
});

function apply() {
  theme.resolved = theme.preference === 'system' ? (media.matches ? 'dark' : 'light') : theme.preference;
  document.documentElement.dataset.theme = theme.resolved;
}

export function setTheme(preference) {
  theme.preference = preference;
  if (preference === 'system') localStorage.removeItem(key);
  else localStorage.setItem(key, preference);
  apply();
}

media.addEventListener('change', apply);
apply();
