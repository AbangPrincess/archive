import { useEffect, useState, useSyncExternalStore } from 'react';
import { db, uid } from './db';
import { emptyEntry, hasContent, type Entry, type Recording } from './types';
import { resizeImage } from './media';

/** Small in-memory mirror of the entries store so every screen stays in sync. */
let entries: Entry[] = [];
let loaded = false;
const listeners = new Set<() => void>();

function emit() {
  entries = [...entries].sort((a, b) => b.date.localeCompare(a.date));
  listeners.forEach((l) => l());
}

export async function loadEntries() {
  entries = await db.allEntries();
  loaded = true;
  emit();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useEntries(): { entries: Entry[]; loaded: boolean } {
  const list = useSyncExternalStore(subscribe, () => entries);
  return { entries: list, loaded };
}

export function useEntry(date: string): Entry {
  const { entries: list } = useEntries();
  return list.find((e) => e.date === date) ?? emptyEntry(date);
}

export function findEntry(date: string): Entry {
  return entries.find((e) => e.date === date) ?? emptyEntry(date);
}

/** Saves an entry, or removes it from storage once it has nothing left in it. */
export async function saveEntry(next: Entry) {
  const e = { ...next, updatedAt: Date.now() };
  const i = entries.findIndex((x) => x.date === e.date);
  if (!hasContent(e)) {
    if (i >= 0) {
      entries.splice(i, 1);
      emit();
      await db.deleteEntry(e.date);
    }
    return;
  }
  if (i >= 0) entries[i] = e;
  else entries.push(e);
  emit();
  await db.putEntry(e);
}

export async function updateEntry(date: string, patch: (e: Entry) => Entry) {
  await saveEntry(patch(findEntry(date)));
}

export async function addPhotos(date: string, files: Blob[]) {
  const ids: string[] = [];
  for (const file of files) {
    const id = uid();
    const [full, thumb] = await Promise.all([resizeImage(file, 1600, 0.86), resizeImage(file, 420, 0.8)]);
    await db.putBlob(id, full);
    await db.putBlob(`${id}:thumb`, thumb);
    ids.push(id);
  }
  await updateEntry(date, (e) => ({ ...e, photoIds: [...e.photoIds, ...ids] }));
  return ids;
}

export async function removePhoto(date: string, id: string) {
  await updateEntry(date, (e) => ({
    ...e,
    photoIds: e.photoIds.filter((p) => p !== id),
    coverId: e.coverId === id ? undefined : e.coverId,
  }));
  dropUrl(id);
  dropUrl(`${id}:thumb`);
  await db.deleteBlob(id);
  await db.deleteBlob(`${id}:thumb`);
}

export async function addRecording(date: string, blob: Blob, rec: Omit<Recording, 'id' | 'createdAt' | 'mime'>, text: string, title: string) {
  const id = uid();
  await db.putBlob(id, blob);
  const recording: Recording = { ...rec, id, mime: blob.type, createdAt: Date.now() };
  await updateEntry(date, (e) => ({
    ...e,
    title: title.trim() ? title : e.title,
    body: text ? (e.body.trim() ? `${e.body.trimEnd()}\n\n${text}` : text) : e.body,
    spoken: e.spoken || Boolean(text),
    recordings: [...e.recordings, recording],
  }));
  return id;
}

export async function removeRecording(date: string, id: string) {
  await updateEntry(date, (e) => ({ ...e, recordings: e.recordings.filter((r) => r.id !== id) }));
  dropUrl(id);
  await db.deleteBlob(id);
}

export async function deleteEntryCompletely(date: string) {
  const e = findEntry(date);
  for (const p of e.photoIds) {
    dropUrl(p);
    dropUrl(`${p}:thumb`);
    await db.deleteBlob(p);
    await db.deleteBlob(`${p}:thumb`);
  }
  for (const r of e.recordings) {
    dropUrl(r.id);
    await db.deleteBlob(r.id);
  }
  entries = entries.filter((x) => x.date !== date);
  emit();
  await db.deleteEntry(date);
}

export async function wipeEverything() {
  urls.forEach((u) => URL.revokeObjectURL(u));
  urls.clear();
  await db.clearAll();
  entries = [];
  emit();
}

/* ---------- object URLs for stored photos and audio ---------- */
const urls = new Map<string, string>();
const pending = new Map<string, Promise<string | undefined>>();

function dropUrl(id: string) {
  const u = urls.get(id);
  if (u) URL.revokeObjectURL(u);
  urls.delete(id);
}

export function blobUrl(id: string): Promise<string | undefined> {
  const hit = urls.get(id);
  if (hit) return Promise.resolve(hit);
  let p = pending.get(id);
  if (!p) {
    p = db.getBlob(id).then((b) => {
      pending.delete(id);
      if (!b) return undefined;
      const u = URL.createObjectURL(b);
      urls.set(id, u);
      return u;
    });
    pending.set(id, p);
  }
  return p;
}

export function useBlobUrl(id: string | undefined, thumb = false): string | undefined {
  const key = id ? (thumb ? `${id}:thumb` : id) : undefined;
  const [url, setUrl] = useState<string | undefined>(key ? urls.get(key) : undefined);
  useEffect(() => {
    let live = true;
    if (!key) {
      setUrl(undefined);
      return;
    }
    blobUrl(key).then((u) => live && setUrl(u));
    return () => {
      live = false;
    };
  }, [key]);
  return url;
}
