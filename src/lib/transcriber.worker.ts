/// <reference lib="webworker" />
/*
 * Smart Transcription, running entirely on this device in a background thread.
 * A multilingual Whisper speech model figures out which language was spoken
 * (Tagalog, English and ~100 more), then writes the words out with exact timing.
 */
import { env, pipeline, Tensor, type AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers';

const MODEL = 'onnx-community/whisper-base_timestamped';
const SAMPLE_RATE = 16000;

// Philippine languages Whisper doesn't know by name tend to be heard as these.
const NEAR_TAGALOG = new Set(['tl', 'id', 'ms', 'jw', 'su', 'haw', 'mi']);

type InMsg =
  | { type: 'load'; ortBase: string }
  | { type: 'transcribe'; id: number; audio: Float32Array; preferTagalog: boolean };

let asr: AutomaticSpeechRecognitionPipeline | null = null;
let loading: Promise<AutomaticSpeechRecognitionPipeline> | null = null;
let runtimeBase = '';

const post = (msg: unknown) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(msg);

function load(ortBase: string) {
  if (asr) return Promise.resolve(asr);
  if (loading) return loading;
  env.allowLocalModels = false;
  env.useBrowserCache = true;
  const onnx = env.backends.onnx as { wasm?: { wasmPaths?: unknown } };
  if (onnx.wasm) {
    // The speech runtime ships with the app itself, so no third-party code server is used.
    onnx.wasm.wasmPaths = { mjs: `${ortBase}ort-wasm-simd-threaded.mjs`, wasm: `${ortBase}ort-wasm-simd-threaded.wasm` };
  }
  const files = new Map<string, { loaded: number; total: number }>();
  loading = (
    pipeline('automatic-speech-recognition', MODEL, {
      device: 'wasm',
      dtype: 'q8',
      progress_callback: (p: { status: string; file?: string; loaded?: number; total?: number }) => {
        if (p.status === 'progress' && p.file && p.total) {
          files.set(p.file, { loaded: p.loaded ?? 0, total: p.total });
          let loaded = 0;
          let total = 0;
          files.forEach((f) => {
            loaded += f.loaded;
            total += f.total;
          });
          post({ type: 'progress', loaded, total });
        }
      },
    }) as Promise<AutomaticSpeechRecognitionPipeline>
  ).then((p) => {
    asr = p;
    return p;
  });
  loading.catch(() => {
    loading = null;
  });
  return loading;
}

/** Asks the model which language token it expects first, using the first 30 seconds. */
async function detectLanguage(p: AutomaticSpeechRecognitionPipeline, audio: Float32Array, preferTagalog: boolean): Promise<string> {
  const gc = p.model.generation_config as unknown as { decoder_start_token_id: number; lang_to_id: Record<string, number> };
  const { input_features } = await p.processor(audio.subarray(0, SAMPLE_RATE * 30));
  const decoder_input_ids = new Tensor('int64', BigInt64Array.from([BigInt(gc.decoder_start_token_id)]), [1, 1]);
  const out = (await p.model({ input_features, decoder_input_ids })) as { logits: Tensor };
  const logits = out.logits.data as Float32Array;
  const langs = Object.entries(gc.lang_to_id).map(([tok, id]) => ({ code: tok.slice(2, -2), score: logits[id] }));
  const max = Math.max(...langs.map((l) => l.score));
  const sum = langs.reduce((s, l) => s + Math.exp(l.score - max), 0);
  const prob = (code: string) => {
    const l = langs.find((x) => x.code === code);
    return l ? Math.exp(l.score - max) / sum : 0;
  };
  const top = langs.reduce((a, b) => (b.score > a.score ? b : a)).code;
  // Taglish is often scored as English or a neighbouring language; on Philippine devices
  // lean towards Tagalog, whose model also writes English words as English.
  if (preferTagalog && (NEAR_TAGALOG.has(top) || prob('tl') >= 0.12)) return 'tl';
  return top;
}

type Chunk = { text: string; timestamp: [number, number | null] };
type Output = { text: string; chunks?: Chunk[] };

// Everyday Tagalog words. If an "English" transcript is full of these, the speaker was really
// talking in Tagalog/Taglish (often with an accent the sound-based guess misread).
const TAGALOG_WORDS = new Set(
  'ang ng mga sa na nang ako ko ka mo siya kami kayo sila namin natin nila tayo ito iyan iyon yung yun po opo hindi wala may meron lang din rin pa ba naman kasi pero talaga ngayon kanina bukas kahapon tapos sobra ganda masaya salamat kain ano bakit paano saan dito doon diyan nga eh sige oo kaya parang dahil kung para nasa mo'.split(' '),
);

function looksTagalog(text: string): boolean {
  const words = text.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().match(/[a-zñ']+/g) ?? [];
  if (words.length < 3) return false;
  const hits = words.filter((w) => TAGALOG_WORDS.has(w)).length;
  return hits >= 2 && hits / words.length >= 0.1;
}

async function run(p: AutomaticSpeechRecognitionPipeline, audio: Float32Array, language: string): Promise<{ out: Output; exact: boolean }> {
  const base = { language, task: 'transcribe', chunk_length_s: 30, stride_length_s: 5 };
  try {
    return { out: (await p(audio, { ...base, return_timestamps: 'word' } as never)) as Output, exact: true };
  } catch {
    return { out: (await p(audio, { ...base, return_timestamps: true } as never)) as Output, exact: false };
  }
}

async function transcribe(id: number, audio: Float32Array, preferTagalog: boolean) {
  const p = await load(runtimeBase);
  let language = await detectLanguage(p, audio, preferTagalog);
  let { out, exact } = await run(p, audio, language);
  // Second opinion from the words themselves (Philippine devices only).
  if (preferTagalog && language !== 'tl' && looksTagalog(out.text)) {
    language = 'tl';
    ({ out, exact } = await run(p, audio, 'tl'));
  }
  const duration = audio.length / SAMPLE_RATE;
  const segments = (out.chunks ?? [])
    .map((c) => ({ text: c.text.trim(), start: c.timestamp[0] ?? 0, end: c.timestamp[1] ?? duration }))
    .filter((s) => s.text);
  post({ type: 'result', id, language, text: out.text.trim(), segments, exact });
}

self.onmessage = async (e: MessageEvent<InMsg>) => {
  const msg = e.data;
  try {
    if (msg.type === 'load') {
      runtimeBase = msg.ortBase;
      await load(msg.ortBase);
      post({ type: 'ready' });
    } else if (msg.type === 'transcribe') {
      await transcribe(msg.id, msg.audio, msg.preferTagalog);
    }
  } catch (err) {
    post({ type: 'error', id: 'id' in msg ? msg.id : null, message: (err as Error)?.message ?? String(err) });
  }
};
