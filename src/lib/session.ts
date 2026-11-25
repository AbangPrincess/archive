/**
 * Remembers, for this browser tab only, that the journal was unlocked, so a
 * page refresh doesn't ask for the PIN again. Auto-Lock decides when it must.
 *
 * - `unlocked`  set when the PIN is entered, cleared by Lock Now or auto-lock.
 * - `lastSeen`  refreshed while the app is open and when the page is left.
 * - `awaySince` set when the app is switched away from; cleared on a plain
 *               refresh (which fires `pagehide`), so only real time away counts.
 */
const K = { unlocked: 'archive.unlocked', lastSeen: 'archive.lastSeen', awaySince: 'archive.awaySince' };

/** A refresh takes a moment; never treat that moment as time away. */
const REFRESH_GRACE_MS = 10_000;

function get(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}
function set(key: string, value: string | null) {
  try {
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, value);
  } catch {
    /* storage blocked: the app simply asks for the PIN each time */
  }
}

export function markUnlocked() {
  set(K.unlocked, '1');
  set(K.awaySince, null);
  touch();
}

export function markLocked() {
  set(K.unlocked, null);
  set(K.awaySince, null);
}

export function touch() {
  set(K.lastSeen, String(Date.now()));
}

export function markAway() {
  set(K.awaySince, String(Date.now()));
  touch();
}

/** Called on `pagehide`: the page is being refreshed or navigated, not switched away from. */
export function markLeavingPage() {
  set(K.awaySince, null);
  touch();
}

/** On page load: is the journal still unlocked under the current Auto-Lock setting? */
export function stillUnlocked(autoLockMinutes: number): boolean {
  if (get(K.unlocked) !== '1') return false;
  const limit = autoLockMinutes * 60_000;
  const away = Number(get(K.awaySince) ?? 0);
  if (away && Date.now() - away >= Math.max(limit, 1500)) return false;
  const seen = Number(get(K.lastSeen) ?? 0);
  return Date.now() - seen <= Math.max(limit, REFRESH_GRACE_MS);
}
