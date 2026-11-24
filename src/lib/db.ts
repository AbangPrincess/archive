import type { Entry } from './types';

/**
 * All journal data lives in this browser's IndexedDB on the user's device.
 * Nothing here is ever sent to a server.
 */
const DB_NAME = 'archive-journal';
const DB_VERSION = 1;
const ENTRIES = 'entries';
const BLOBS = 'blobs';

type BlobRecord = { id: string; blob: Blob };

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(ENTRIES)) db.createObjectStore(ENTRIES, { keyPath: 'date' });
        if (!db.objectStoreNames.contains(BLOBS)) db.createObjectStore(BLOBS, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function run<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const req = fn(tx.objectStore(store));
        tx.oncomplete = () => resolve(req ? req.result : (undefined as T));
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      }),
  );
}

export const db = {
  allEntries: () => run<Entry[]>(ENTRIES, 'readonly', (s) => s.getAll()),
  getEntry: (date: string) => run<Entry | undefined>(ENTRIES, 'readonly', (s) => s.get(date)),
  putEntry: (e: Entry) => run(ENTRIES, 'readwrite', (s) => s.put(e)),
  deleteEntry: (date: string) => run(ENTRIES, 'readwrite', (s) => s.delete(date)),
  getBlob: async (id: string) => (await run<BlobRecord | undefined>(BLOBS, 'readonly', (s) => s.get(id)))?.blob,
  putBlob: (id: string, blob: Blob) => run(BLOBS, 'readwrite', (s) => s.put({ id, blob })),
  deleteBlob: (id: string) => run(BLOBS, 'readwrite', (s) => s.delete(id)),
  async clearAll() {
    await run(ENTRIES, 'readwrite', (s) => s.clear());
    await run(BLOBS, 'readwrite', (s) => s.clear());
  },
};

export function uid(): string {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
