/** Downscales an image so photos stay light on the device's storage. */
export async function resizeImage(file: Blob, maxSide: number, quality: number): Promise<Blob> {
  const bitmap = await loadBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, w, h);
  if ('close' in bitmap) (bitmap as ImageBitmap).close();
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b ?? file), 'image/jpeg', quality));
}

async function loadBitmap(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
    } catch {
      /* fall through to <img> decoding */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export type AudioAnalysis = {
  peaks: number[];
  /** Loudness (RMS) of every FRAME_SEC slice of the recording. */
  energy: Float32Array;
  frameSec: number;
  duration: number;
};

const FRAME_SEC = 0.02;

/** Decodes a recording once to get its waveform and a loudness track for word timing. */
export async function analyzeRecording(blob: Blob, bars: number): Promise<AudioAnalysis | null> {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const audio = await ctx.decodeAudioData(await blob.arrayBuffer());
    ctx.close().catch(() => undefined);
    const data = audio.getChannelData(0);
    const per = Math.max(1, Math.round(audio.sampleRate * FRAME_SEC));
    const frames = Math.ceil(data.length / per);
    const energy = new Float32Array(frames);
    for (let f = 0; f < frames; f++) {
      let sum = 0;
      const end = Math.min(data.length, (f + 1) * per);
      for (let j = f * per; j < end; j++) sum += data[j] * data[j];
      energy[f] = Math.sqrt(sum / Math.max(1, end - f * per));
    }
    const step = frames / bars;
    const peaks: number[] = [];
    for (let i = 0; i < bars; i++) {
      let max = 0;
      for (let f = Math.floor(i * step); f < Math.min(frames, Math.floor((i + 1) * step)); f++) max = Math.max(max, energy[f]);
      peaks.push(max);
    }
    const top = Math.max(...peaks, 0.0001);
    return { peaks: peaks.map((p) => Math.max(0.08, p / top)), energy, frameSec: FRAME_SEC, duration: audio.duration };
  } catch {
    return null;
  }
}

export const placeholderPeaks = (bars: number) => Array.from({ length: bars }, (_, i) => 0.3 + 0.5 * Math.abs(Math.sin(i * 0.7)));

/** Marks which frames contain speech, using a threshold set from this recording's own noise floor. */
function voicedFrames(energy: Float32Array): boolean[] {
  const sorted = [...energy].sort((a, b) => a - b);
  const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? 0;
  const floor = q(0.15);
  const loud = q(0.95);
  const threshold = floor + (loud - floor) * 0.16;
  const v = Array.from(energy, (e) => e > threshold);
  // Bridge short gaps inside words (< 180 ms) and drop clicks (< 60 ms).
  const fill = (target: boolean, maxLen: number) => {
    let i = 0;
    while (i < v.length) {
      if (v[i] === target) {
        let j = i;
        while (j < v.length && v[j] === target) j++;
        const inside = i > 0 && j < v.length;
        if (inside && j - i <= maxLen) for (let k = i; k < j; k++) v[k] = !target;
        i = j;
      } else i++;
    }
  };
  fill(false, 9);
  fill(true, 3);
  return v;
}

export type TimedWord = { text: string; at: number };

/**
 * Places every transcribed word on the recording's timeline. Each phrase owns the
 * stretch of audio between the previous phrase's end and its own end; inside
 * that stretch its words are laid over the frames that actually contain speech,
 * weighted by word length. This keeps the highlight on the word being spoken.
 */
export function alignWords(segments: { text: string; start: number; end: number }[], audio: AudioAnalysis | null, total: number): TimedWord[] {
  const out: TimedWord[] = [];
  const voiced = audio ? voicedFrames(audio.energy) : null;
  const fs = audio?.frameSec ?? FRAME_SEC;
  const length = audio?.duration && Number.isFinite(audio.duration) ? audio.duration : total;
  let windowStart = 0;
  segments.forEach((s, k) => {
    const words = s.text.split(/\s+/).filter(Boolean);
    if (!words.length) return;
    const windowEnd = k === segments.length - 1 ? length : Math.min(length, Math.max(windowStart, s.end));
    const weights = words.map((w) => w.replace(/[^\p{L}\p{N}]/gu, '').length + 1.5);
    const sum = weights.reduce((a, b) => a + b, 0);
    let speech: number[] = [];
    if (voiced) {
      for (let f = Math.floor(windowStart / fs); f < Math.min(voiced.length, Math.ceil(windowEnd / fs)); f++) if (voiced[f]) speech.push(f);
    }
    let acc = 0;
    if (speech.length * fs >= 0.25) {
      words.forEach((w, i) => {
        const idx = Math.min(speech.length - 1, Math.floor((acc / sum) * speech.length));
        out.push({ text: w, at: speech[idx] * fs });
        acc += weights[i];
      });
    } else {
      // No usable audio here: spread the words evenly over the phrase's own timing.
      const a = Math.max(windowStart, s.start);
      const b = Math.max(a + 0.2, s.end);
      words.forEach((w, i) => {
        out.push({ text: w, at: a + ((b - a) * acc) / sum });
        acc += weights[i];
      });
    }
    windowStart = windowEnd;
    speech = [];
  });
  return out;
}

export function pickRecorderMime(): string {
  const options = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  if (typeof MediaRecorder === 'undefined') return '';
  return options.find((m) => MediaRecorder.isTypeSupported(m)) ?? '';
}
