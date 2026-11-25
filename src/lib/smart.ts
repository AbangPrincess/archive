import { useSyncExternalStore } from 'react';
import { db } from './db';
import { autoSpeechLang, getSettings, setSettings } from './settings';
import { currentEntries, findEntry, saveEntry } from './store';
import type { Recording, Segment } from './types';

/*
 * Smart Transcription (optional): after a recording ends, an on-device Whisper model
 * detects the spoken language and rewrites the live preview with an accurate
 * transcript and word-by-word timing. Audio never leaves the device.
 */

type Status = { state: 'off' | 'downloading' | 'ready' | 'error'; progress: number; message?: string; working: Set<string> };

let status: Status = { state: 'off', progress: 0, working: new Set() };
const listeners = new Set<() => void>();
const emit = (patch: Partial<Status>) => {
  status = { ...status, ...patch };
  listeners.forEach((l) => l());
};

export function useSmartStatus(): Status {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => status,
  );
}

let worker: Worker | null = null;
let ready: Promise<void> | null = null;
let nextId = 1;
const jobs = new Map<number, { resolve: (r: SmartResult) => void; reject: (e: Error) => void }>();

type SmartResult = { language: string; text: string; segments: Segment[]; exact: boolean };

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('./transcriber.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (e: MessageEvent) => {
    const m = e.data;
    if (m.type === 'progress') emit({ state: 'downloading', progress: Math.round((m.loaded / m.total) * 100) });
    else if (m.type === 'result') {
      jobs.get(m.id)?.resolve({ language: m.language, text: m.text, segments: m.segments, exact: m.exact });
      jobs.delete(m.id);
    } else if (m.type === 'error') {
      const err = new Error(m.message);
      if (m.id != null) {
        jobs.get(m.id)?.reject(err);
        jobs.delete(m.id);
      }
    }
  };
  return worker;
}

/** Downloads (first time only) and loads the speech model. */
export function prepareModel(): Promise<void> {
  if (ready) return ready;
  emit({ state: 'downloading', progress: 0, message: undefined });
  const w = getWorker();
  ready = new Promise<void>((resolve, reject) => {
    const onMsg = (e: MessageEvent) => {
      if (e.data.type === 'ready') {
        w.removeEventListener('message', onMsg);
        emit({ state: 'ready', progress: 100 });
        resolve();
      } else if (e.data.type === 'error' && e.data.id == null) {
        w.removeEventListener('message', onMsg);
        emit({ state: 'error', message: e.data.message });
        ready = null;
        reject(new Error(e.data.message));
      }
    };
    w.addEventListener('message', onMsg);
    w.postMessage({ type: 'load', ortBase: new URL('./ort/', document.baseURI).href });
  });
  return ready;
}

/** Frees the downloaded model from this device. */
export async function removeModel() {
  worker?.terminate();
  worker = null;
  ready = null;
  try {
    await caches.delete('transformers-cache');
  } catch {
    /* nothing cached */
  }
  emit({ state: 'off', progress: 0 });
}

/** Whisper wants 16 kHz mono audio. */
async function toMono16k(blob: Blob): Promise<Float32Array> {
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
  ctx.close().catch(() => undefined);
  const length = Math.ceil(decoded.duration * 16000);
  const off = new OfflineAudioContext(1, Math.max(1, length), 16000);
  const src = off.createBufferSource();
  src.buffer = decoded;
  src.connect(off.destination);
  src.start();
  return (await off.startRendering()).getChannelData(0);
}

export async function transcribeBlob(blob: Blob, preferTagalog = (getSettings().speechLang || autoSpeechLang()).endsWith('-PH')): Promise<SmartResult> {
  await prepareModel();
  const audio = await toMono16k(blob);
  const id = nextId++;
  return new Promise<SmartResult>((resolve, reject) => {
    jobs.set(id, { resolve, reject });
    getWorker().postMessage({ type: 'transcribe', id, audio, preferTagalog }, [audio.buffer]);
  });
}

export const languageName = (code: string) => {
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) ?? code;
  } catch {
    return code;
  }
};

/** Hook for screens to announce a finished transcript (set by the toast host). */
let announce: (msg: string) => void = () => undefined;
export function setSmartAnnouncer(fn: (msg: string) => void) {
  announce = fn;
}
export function notifySmart(_rec: Recording, language: string) {
  announce(`Your words were written out in ${languageName(language)}.`);
}

/** Whether the speech model files are already saved on this device. */
export async function isModelDownloaded(): Promise<boolean> {
  try {
    const cache = await caches.open('transformers-cache');
    const keys = await cache.keys();
    return keys.some((k) => k.url.includes('whisper-base_timestamped') && k.url.includes('decoder_model_merged'));
  } catch {
    return false;
  }
}

/* ---------- queue: improve every recording waiting for Smart Transcription ---------- */

let running = false;

export async function runSmartQueue(onDone?: (rec: Recording, language: string) => void) {
  if (running || !getSettings().smartSpeech) return;
  running = true;
  try {
    for (;;) {
      const next = pending();
      if (!next) break;
      const { date, rec } = next;
      emit({ working: new Set([...status.working, rec.id]) });
      try {
        const blob = await db.getBlob(rec.id);
        if (!blob) throw new Error('missing audio');
        const r = await transcribeBlob(blob);
        applyResult(date, rec.id, r);
        onDone?.(rec, r.language);
      } catch {
        markRec(date, rec.id, { smart: 'failed' });
      } finally {
        const w = new Set(status.working);
        w.delete(rec.id);
        emit({ working: w });
      }
    }
  } finally {
    running = false;
  }
}

function pending(): { date: string; rec: Recording } | null {
  for (const e of currentEntries()) for (const rec of e.recordings) if (rec.smart === 'pending') return { date: e.date, rec };
  return null;
}

function markRec(date: string, id: string, patch: Partial<Recording>) {
  const e = findEntry(date);
  void saveEntry({ ...e, recordings: e.recordings.map((r) => (r.id === id ? { ...r, ...patch } : r)) });
}

function applyResult(date: string, id: string, r: SmartResult) {
  const e = findEntry(date);
  const rec = e.recordings.find((x) => x.id === id);
  if (!rec) return;
  const text = r.text.replace(/\s+/g, ' ').trim();
  let body = e.body;
  if (text) {
    if (rec.liveText && body.includes(rec.liveText)) body = body.replace(rec.liveText, text);
    else if (!body.includes(text)) body = body.trim() ? `${body.trimEnd()}\n\n${text}` : text;
  }
  const recordings = e.recordings.map((x) =>
    x.id === id ? { ...x, segments: r.segments.length ? r.segments : x.segments, exact: r.exact && r.segments.length > 0, language: r.language, liveText: text || x.liveText, smart: 'done' as const } : x,
  );
  void saveEntry({ ...e, body, spoken: true, recordings });
}

/** Turns the feature on or off; turning it on starts the one-time download. */
export async function setSmartSpeech(on: boolean) {
  setSettings({ smartSpeech: on });
  if (on) await prepareModel();
}
