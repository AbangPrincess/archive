/**
 * 4-digit PIN lock. The PIN is kept on this device as a salted SHA-256 hash,
 * never as plain digits. It keeps casual eyes out; it is not encryption.
 */
const K = {
  pin: 'archive.pin',
  hint: 'archive.hint',
  fails: 'archive.fails',
  lockUntil: 'archive.lockUntil',
  hintOpen: 'archive.hintOpen',
};

export const MAX_TRIES = 5;
export const HINT_AFTER = 4;
export const LOCK_MS = 5 * 60 * 1000;

type Stored = { salt: string; hash: string };

const toHex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

async function digest(salt: string, pin: string) {
  return toHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${pin}`)));
}

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked: nothing else to do */
  }
}

export const hasPin = () => read<Stored>(K.pin) !== null;

export async function setPin(pin: string) {
  const salt = toHex(crypto.getRandomValues(new Uint8Array(16)).buffer);
  write(K.pin, { salt, hash: await digest(salt, pin) });
  resetFails();
}

export async function checkPin(pin: string): Promise<boolean> {
  const s = read<Stored>(K.pin);
  if (!s) return false;
  return (await digest(s.salt, pin)) === s.hash;
}

export const getHint = () => read<string>(K.hint) ?? '';
export const setHint = (hint: string) => write(K.hint, hint.trim());

export const getFails = () => read<number>(K.fails) ?? 0;
export const hintUnlocked = () => read<boolean>(K.hintOpen) === true;

export function lockRemaining(): number {
  const until = read<number>(K.lockUntil) ?? 0;
  return Math.max(0, until - Date.now());
}

/** Records a wrong PIN. Returns the new failure count (0 after a lockout starts). */
export function recordFail(): number {
  const fails = getFails() + 1;
  if (fails >= HINT_AFTER) write(K.hintOpen, true);
  if (fails >= MAX_TRIES) {
    write(K.lockUntil, Date.now() + LOCK_MS);
    write(K.fails, 0);
    return MAX_TRIES;
  }
  write(K.fails, fails);
  return fails;
}

export function resetFails() {
  write(K.fails, 0);
  write(K.lockUntil, 0);
  write(K.hintOpen, false);
}

export function clearPinData() {
  Object.values(K).forEach((k) => localStorage.removeItem(k));
}
