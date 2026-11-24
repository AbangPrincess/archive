const pad = (n: number) => String(n).padStart(2, '0');

export function toKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export const todayKey = () => toKey(new Date());

export function isValidKey(key: string | undefined): key is string {
  if (!key || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  return toKey(fromKey(key)) === key;
}

const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(undefined, opts);

export const weekdayName = (key: string) => fmt({ weekday: 'long' }).format(fromKey(key));
export const longDate = (key: string) => fmt({ day: 'numeric', month: 'long', year: 'numeric' }).format(fromKey(key));
export const shortDate = (key: string) => fmt({ day: 'numeric', month: 'short' }).format(fromKey(key));
export const mediumDate = (key: string) => fmt({ day: 'numeric', month: 'short', year: 'numeric' }).format(fromKey(key));
export const cardDate = (key: string) => `${fmt({ weekday: 'short' }).format(fromKey(key))} · ${shortDate(key)}`;
export const monthTitle = (y: number, m: number) => fmt({ month: 'long', year: 'numeric' }).format(new Date(y, m, 1));
export const timeOf = (ms: number) => fmt({ hour: 'numeric', minute: '2-digit' }).format(new Date(ms));

export function weekdayInitials(): string[] {
  const base = new Date(2023, 0, 1); // a Sunday
  return Array.from({ length: 7 }, (_, i) => fmt({ weekday: 'narrow' }).format(new Date(base.getFullYear(), 0, 1 + i)));
}

export function duration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${pad(s % 60)}`;
}
