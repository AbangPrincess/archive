import { useSyncExternalStore } from 'react';

/** Hash-based routes, so the app works from any static host. */
function current(): string {
  return window.location.hash.replace(/^#/, '') || '/all';
}

export function useRoute(): { path: string; parts: string[]; query: URLSearchParams } {
  const hash = useSyncExternalStore(
    (l) => {
      window.addEventListener('hashchange', l);
      return () => window.removeEventListener('hashchange', l);
    },
    current,
  );
  const [path, qs = ''] = hash.split('?');
  return { path, parts: path.split('/').filter(Boolean), query: new URLSearchParams(qs) };
}

export function go(path: string, replace = false) {
  if (replace) window.location.replace(`#${path}`);
  else window.location.hash = path;
}

/** The archive tab the person last looked at, so "back" returns there. */
let lastTab = '/all';
export const rememberTab = (path: string) => {
  lastTab = path;
};
export const tabHome = () => lastTab;
