import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { Confirm } from '../components/Modal';
import { toast } from '../components/Toast';
import { addPhotos, addRecording, updateEntry, useEntry } from '../lib/store';
import { duration, fromKey } from '../lib/dates';
import { go } from '../lib/router';
import { locateMe } from '../lib/geo';
import { pickRecorderMime } from '../lib/media';
import { SPEECH_LANGUAGES, speechFallbacks, speechLangFor } from '../lib/settings';
import { recognizerClass, speechErrorMessage, tidyPhrase, type Recognizer } from '../lib/speech';
import type { Segment } from '../lib/types';

type Phase = 'idle' | 'recording' | 'paused' | 'saving';
const BARS = 40;

export function DictateScreen({ date }: { date: string }) {
  const entry = useEntry(date);
  const [phase, setPhase] = useState<Phase>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [finals, setFinals] = useState<Segment[]>([]);
  const [interim, setInterim] = useState('');
  const [notice, setNotice] = useState<string | null>(() =>
    recognizerClass() ? null : 'Speech-to-text isn’t available in this browser. Your voice will still be recorded so you can listen back later.',
  );
  const [title, setTitle] = useState(entry.title);
  const [levels, setLevels] = useState<number[]>(() => Array(BARS).fill(0.06));
  const [locating, setLocating] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);

  const stream = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const recog = useRef<Recognizer | null>(null);
  const listening = useRef(false);
  const startedAt = useRef(0);
  const banked = useRef(0);
  const segStarts = useRef<Record<number, number>>({});
  const doneIdx = useRef<Set<number>>(new Set());
  const finalsRef = useRef<Segment[]>([]);
  const interimRef = useRef('');
  const audioCtx = useRef<AudioContext | null>(null);
  const raf = useRef(0);
  const transcriptEl = useRef<HTMLDivElement>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const lang = useRef(speechLangFor());
  const tried = useRef<Set<string>>(new Set([lang.current]));

  const now = useCallback(() => banked.current + (startedAt.current ? (performance.now() - startedAt.current) / 1000 : 0), []);

  // Timer
  useEffect(() => {
    if (phase !== 'recording') return;
    const t = window.setInterval(() => setElapsed(now()), 250);
    return () => window.clearInterval(t);
  }, [phase, now]);

  // Keep the newest words in view.
  useEffect(() => {
    const el = transcriptEl.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [finals, interim]);

  const startRecognition = useCallback(() => {
    const Ctor = recognizerClass();
    if (!Ctor) return;
    const r = new Ctor();
    r.lang = lang.current;
    r.continuous = true;
    r.interimResults = true;
    r.maxAlternatives = 1;
    segStarts.current = {};
    doneIdx.current = new Set();
    r.onresult = (e) => {
      let live = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (segStarts.current[i] === undefined) segStarts.current[i] = now();
        if (res.isFinal) {
          if (doneIdx.current.has(i)) continue;
          doneIdx.current.add(i);
          const text = tidyPhrase(res[0].transcript);
          if (text) {
            const seg = { text, start: Math.max(0, segStarts.current[i] - 0.4), end: now() };
            finalsRef.current = [...finalsRef.current, seg];
            setFinals(finalsRef.current);
          }
        } else {
          live += res[0].transcript;
        }
      }
      interimRef.current = live.trim();
      setInterim(interimRef.current);
    };
    r.onerror = (e) => {
      if (e.error === 'language-not-supported') {
        // Switch to the next language the browser can handle and keep listening.
        const next = speechFallbacks(lang.current).find((l) => !tried.current.has(l));
        if (next) {
          const name = (code: string) => SPEECH_LANGUAGES.find((l) => l.code === code)?.label ?? code;
          setNotice(`This browser can’t listen in ${name(lang.current)} yet, so it’s listening in ${name(next)} instead. Your voice is still recorded word for word.`);
          tried.current.add(next);
          lang.current = next;
          return;
        }
      }
      const msg = speechErrorMessage(e.error);
      if (msg) setNotice(msg);
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed' || e.error === 'language-not-supported' || e.error === 'audio-capture') listening.current = false;
    };
    r.onend = () => {
      commitInterim();
      if (listening.current) {
        window.setTimeout(() => {
          if (!listening.current) return;
          try {
            startRecognition();
          } catch {
            /* the browser refused to restart; recording continues */
          }
        }, 250);
      }
    };
    recog.current = r;
    try {
      r.start();
    } catch {
      /* already started */
    }
  }, [now]);

  function commitInterim() {
    const text = tidyPhrase(interimRef.current);
    if (!text) return;
    const keys = Object.keys(segStarts.current).map(Number);
    const start = keys.length ? Math.min(...keys.map((k) => segStarts.current[k])) : now();
    finalsRef.current = [...finalsRef.current, { text, start, end: now() }];
    setFinals(finalsRef.current);
    interimRef.current = '';
    setInterim('');
  }

  const stopRecognition = () => {
    listening.current = false;
    try {
      recog.current?.stop();
    } catch {
      /* ignore */
    }
  };

  const drawLevels = (analyser: AnalyserNode) => {
    const data = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser.getByteTimeDomainData(data);
      let peak = 0;
      for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i] - 128) / 128);
      setLevels((prev) => [...prev.slice(1), Math.min(1, 0.06 + peak * 1.6)]);
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  };

  const start = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      stream.current = s;
      const mime = pickRecorderMime();
      if (typeof MediaRecorder !== 'undefined') {
        const rec = new MediaRecorder(s, mime ? { mimeType: mime } : undefined);
        chunks.current = [];
        rec.ondataavailable = (ev) => ev.data.size && chunks.current.push(ev.data);
        rec.start(1000);
        recorder.current = rec;
      }
      try {
        const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new Ctx();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        ctx.createMediaStreamSource(s).connect(analyser);
        audioCtx.current = ctx;
        drawLevels(analyser);
      } catch {
        /* the wave is decorative */
      }
      banked.current = 0;
      startedAt.current = performance.now();
      listening.current = true;
      startRecognition();
      setPhase('recording');
    } catch {
      setNotice('Microphone access was blocked. Allow the microphone in your browser settings, then try again.');
    }
  };

  const pause = () => {
    if (phase !== 'recording') return;
    banked.current = now();
    startedAt.current = 0;
    recorder.current?.state === 'recording' && recorder.current.pause();
    stopRecognition();
    setElapsed(banked.current);
    setPhase('paused');
  };

  const resume = () => {
    if (phase !== 'paused') return;
    startedAt.current = performance.now();
    recorder.current?.state === 'paused' && recorder.current.resume();
    listening.current = true;
    startRecognition();
    setPhase('recording');
  };

  const cleanup = useCallback(() => {
    listening.current = false;
    try {
      recog.current?.abort();
    } catch {
      /* ignore */
    }
    cancelAnimationFrame(raf.current);
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    audioCtx.current?.close().catch(() => undefined);
    audioCtx.current = null;
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const finish = async (thenFocusBody = false) => {
    if (phase === 'idle') {
      if (title.trim() !== entry.title) await updateEntry(date, (e) => ({ ...e, title }));
      go(`/entry/${date}${thenFocusBody ? '?focus=body' : ''}`);
      return;
    }
    if (phase === 'saving') return;
    setPhase('saving');
    const total = now();
    stopRecognition();
    await new Promise((r) => window.setTimeout(r, 500)); // let the last words arrive
    commitInterim();
    const blob = await new Promise<Blob | null>((resolve) => {
      const rec = recorder.current;
      if (!rec || rec.state === 'inactive') return resolve(null);
      rec.onstop = () => resolve(new Blob(chunks.current, { type: rec.mimeType || 'audio/webm' }));
      rec.stop();
    });
    cleanup();
    const segments = finalsRef.current;
    const text = segments.map((s) => s.text).join(' ');
    if (blob && blob.size > 0 && total >= 0.5) {
      await addRecording(date, blob, { duration: total, segments }, text, title);
    } else if (text || title.trim()) {
      await updateEntry(date, (e) => ({
        ...e,
        title: title.trim() ? title : e.title,
        body: text ? (e.body.trim() ? `${e.body.trimEnd()}\n\n${text}` : text) : e.body,
        spoken: e.spoken || Boolean(text),
      }));
    }
    go(`/entry/${date}${thenFocusBody ? '?focus=body' : ''}`);
  };

  const close = () => {
    if (phase === 'recording' || phase === 'paused') setConfirmLeave(true);
    else finish();
  };

  const addLocation = async () => {
    setLocating(true);
    try {
      const place = await locateMe();
      await updateEntry(date, (e) => ({ ...e, place }));
    } catch (err) {
      toast((err as Error).message);
    } finally {
      setLocating(false);
    }
  };

  const day = fromKey(date);
  const statusLabel = phase === 'recording' ? 'Listening' : phase === 'paused' ? 'Paused' : phase === 'saving' ? 'Saving' : 'Ready';
  const live = phase === 'recording' || phase === 'paused';

  return (
    <div className="tool-page">
      <div className="wrap narrow">
        <div className="subbar-inner">
          <button className="icon-btn" aria-label="Close" onClick={close}>
            <Icon name="x" stroke={2} />
          </button>
          <span className="status-pill" role="status" style={{ margin: '0 auto' }}>
            <span className={`dot${phase === 'recording' ? '' : ' idle'}`} />
            {statusLabel}
            <span className="time">{duration(elapsed)}</span>
          </span>
          <span aria-hidden="true" />
        </div>

        <div className="stack" style={{ gap: 6, paddingTop: 16 }}>
          <span className="eyebrow">
            {new Intl.DateTimeFormat(undefined, { weekday: 'long' }).format(day)} · {new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'long' }).format(day)}
          </span>
          <label className="sr-only" htmlFor="speak-title">
            Headline
          </label>
          <input
            id="speak-title"
            className="title-input"
            value={title}
            maxLength={120}
            placeholder="Give Today a Headline"
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <div ref={transcriptEl} className="transcript" aria-live="polite">
          {finals.length === 0 && !interim && (
            <p className="placeholder" style={{ margin: 0 }}>
              {phase === 'idle' ? 'Tap the microphone and talk about your day. Your words will appear here as you speak.' : 'Listening…'}
            </p>
          )}
          {(finals.length > 0 || interim) && (
            <p style={{ margin: 0 }}>
              {finals.map((s) => s.text).join(' ')} <span className="interim">{interim}</span>
            </p>
          )}
        </div>

        {notice && (
          <p className="notice" role="alert" style={{ margin: '0 0 12px' }}>
            {notice}
          </p>
        )}

        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          {live ? (
            <button className="pill" onClick={() => photoInput.current?.click()}>
              <Icon name="camera" size={16} stroke={1.9} />
              Add Photos
            </button>
          ) : (
            <a className="pill" href={`#/entry/${date}/camera`}>
              <Icon name="camera" size={16} stroke={1.9} />
              Add Photos
            </a>
          )}
          <button className="pill" onClick={addLocation} disabled={locating} style={{ minWidth: 0 }}>
            <Icon name="pin" size={16} stroke={1.9} style={{ color: 'var(--accent)' }} />
            <span className="ellipsis">{locating ? 'Finding You…' : (entry.place?.name ?? 'Add Location')}</span>
          </button>
          <input
            ref={photoInput}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            hidden
            onChange={async (e) => {
              const files = [...(e.target.files ?? [])];
              e.target.value = '';
              if (files.length) {
                await addPhotos(date, files);
                toast(`${files.length} ${files.length === 1 ? 'photo' : 'photos'} added.`);
              }
            }}
          />
        </div>

        <div className="live-wave" aria-hidden="true" style={{ marginTop: 16 }}>
          {levels.map((l, i) => (
            <i key={i} style={{ height: `${Math.round(8 + l * 70)}px`, opacity: phase === 'recording' ? 1 : 0.35 }} />
          ))}
        </div>

        <div className="controls">
          <button className="ctl" onClick={() => finish(true)} disabled={phase === 'saving'}>
            <span className="ring">
              <Icon name="keyboard" size={20} />
            </span>
            Type
          </button>
          {phase === 'idle' ? (
            <button className="ctl primary" onClick={start}>
              <span className="ring">
                <Icon name="mic" size={32} stroke={2} />
              </span>
              Start
            </button>
          ) : (
            <button className="ctl primary" onClick={() => finish()} disabled={phase === 'saving'}>
              <span className="ring">
                <Icon name="check" size={30} stroke={2.4} />
              </span>
              Done
            </button>
          )}
          <button className="ctl" onClick={phase === 'paused' ? resume : pause} disabled={!live}>
            <span className="ring">
              <Icon name={phase === 'paused' ? 'mic' : 'pause'} size={phase === 'paused' ? 20 : 18} />
            </span>
            {phase === 'paused' ? 'Resume' : 'Pause'}
          </button>
        </div>
      </div>

      {confirmLeave && (
        <Confirm
          title="Discard This Recording?"
          message="You’re still recording. Leaving now throws away this recording and the words it captured."
          confirmLabel="Discard"
          danger
          onConfirm={() => {
            cleanup();
            go(`/entry/${date}`);
          }}
          onClose={() => setConfirmLeave(false)}
        />
      )}
    </div>
  );
}
