import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { Photo } from '../components/Photo';
import { blobUrl, useEntry } from '../lib/store';
import { db } from '../lib/db';
import { duration, longDate } from '../lib/dates';
import { go } from '../lib/router';
import { waveformPeaks } from '../lib/media';
import { getSettings } from '../lib/settings';
import { coverOf } from '../lib/types';

type Mode = 'voice' | 'read';
type Word = { text: string; at: number; char: number };
const SPEEDS = [1, 1.25, 1.5, 2, 0.75];
const BARS = 48;

export function ListenScreen({ date, recId }: { date: string; recId: string | null }) {
  const entry = useEntry(date);
  const recs = entry.recordings;
  const [currentId, setCurrentId] = useState(recId && recs.some((r) => r.id === recId) ? recId : recs[0]?.id ?? null);
  const rec = recs.find((r) => r.id === currentId) ?? null;
  const [mode, setMode] = useState<Mode>(rec ? 'voice' : 'read');
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [src, setSrc] = useState<string>();
  const [peaks, setPeaks] = useState<number[]>(() => Array(BARS).fill(0.3));
  const [readIdx, setReadIdx] = useState(-1);
  const audio = useRef<HTMLAudioElement>(null);
  const textEl = useRef<HTMLDivElement>(null);
  const readFrom = useRef(0);

  const total = mode === 'voice' ? (rec?.duration ?? 0) : 0;

  // Words timed to the recording (voice) or positioned in the text (read aloud).
  const voiceWords = useMemo<Word[]>(() => {
    if (!rec) return [];
    const out: Word[] = [];
    for (const s of rec.segments) {
      const parts = s.text.split(/\s+/).filter(Boolean);
      const span = Math.max(0.2, s.end - s.start);
      parts.forEach((w, i) => out.push({ text: w, at: s.start + (span * i) / parts.length, char: 0 }));
    }
    return out;
  }, [rec]);

  const readWords = useMemo<Word[]>(() => {
    const out: Word[] = [];
    const re = /\S+/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(entry.body))) out.push({ text: m[0], at: 0, char: m.index });
    return out;
  }, [entry.body]);

  const words = mode === 'voice' ? voiceWords : readWords;
  const nowIdx = mode === 'voice' ? lastIndexAtOrBefore(voiceWords, t) : readIdx;

  // Load audio + waveform for the chosen recording.
  useEffect(() => {
    let live = true;
    setT(0);
    setPlaying(false);
    if (!rec) return;
    blobUrl(rec.id).then((u) => live && setSrc(u));
    db.getBlob(rec.id).then(async (b) => {
      if (b && live) setPeaks(await waveformPeaks(b, BARS));
    });
    return () => {
      live = false;
    };
  }, [rec]);

  useEffect(() => {
    if (audio.current) audio.current.playbackRate = speed;
  }, [speed, src]);

  // Keep the current word in view.
  useEffect(() => {
    if (nowIdx < 0) return;
    const el = textEl.current?.querySelector<HTMLElement>(`[data-i="${nowIdx}"]`);
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [nowIdx]);

  // Stop any speech when leaving or switching modes.
  useEffect(() => () => window.speechSynthesis?.cancel(), []);
  useEffect(() => {
    window.speechSynthesis?.cancel();
    audio.current?.pause();
    setPlaying(false);
    setReadIdx(-1);
  }, [mode]);

  const speakFrom = (wordIndex: number, rate = speed) => {
    const synth = window.speechSynthesis;
    if (!synth || !readWords.length) return;
    synth.cancel();
    const startChar = readWords[Math.max(0, wordIndex)]?.char ?? 0;
    readFrom.current = startChar;
    const u = new SpeechSynthesisUtterance(entry.body.slice(startChar));
    u.lang = getSettings().speechLang || navigator.language || 'en-US';
    u.rate = rate;
    u.onboundary = (e) => {
      const abs = readFrom.current + e.charIndex;
      setReadIdx(lastCharAtOrBefore(readWords, abs));
    };
    u.onend = () => {
      setPlaying(false);
      setReadIdx(-1);
    };
    u.onerror = () => setPlaying(false);
    synth.speak(u);
    setPlaying(true);
  };

  const toggle = () => {
    if (mode === 'voice') {
      const a = audio.current;
      if (!a) return;
      if (a.paused) a.play().catch(() => setPlaying(false));
      else a.pause();
      return;
    }
    if (playing) {
      window.speechSynthesis?.cancel();
      setPlaying(false);
    } else {
      speakFrom(readIdx >= 0 && readIdx < readWords.length - 1 ? readIdx : 0);
    }
  };

  const seek = (sec: number) => {
    const a = audio.current;
    if (!a) return;
    a.currentTime = Math.max(0, Math.min(total, sec));
    setT(a.currentTime);
  };

  const jumpTo = (i: number) => {
    if (mode === 'voice') {
      seek(voiceWords[i].at);
      audio.current?.play().catch(() => undefined);
    } else {
      setReadIdx(i);
      speakFrom(i);
    }
  };

  const cycleSpeed = () => {
    const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
    setSpeed(next);
    if (mode === 'read' && playing) speakFrom(Math.max(0, readIdx), next);
  };

  const progress = mode === 'voice' ? (total ? t / total : 0) : readWords.length ? Math.max(0, readIdx) / readWords.length : 0;

  const share = async () => {
    if (!rec) return;
    const b = await db.getBlob(rec.id);
    if (!b) return;
    const ext = b.type.includes('mp4') ? 'm4a' : b.type.includes('ogg') ? 'ogg' : 'webm';
    const file = new File([b], `${date}-recording.${ext}`, { type: b.type });
    try {
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: entry.title || longDate(date) });
      else {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(file);
        a.download = file.name;
        a.click();
        window.setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      }
    } catch {
      /* share sheet dismissed */
    }
  };

  const cover = coverOf(entry);
  const canRead = typeof window !== 'undefined' && 'speechSynthesis' in window && readWords.length > 0;

  return (
    <div className="tool-page">
      <div className="wrap narrow">
        <div className="subbar-inner">
          <button className="icon-btn" aria-label="Close Player" onClick={() => go(`/entry/${date}`)}>
            <Icon name="chevDown" stroke={2} />
          </button>
          <span className="eyebrow" style={{ textAlign: 'center', fontWeight: 600 }}>
            Listen Back
          </span>
          {rec ? (
            <button className="icon-btn" aria-label="Share or Save Recording" onClick={share}>
              <Icon name="share" size={20} />
            </button>
          ) : (
            <span aria-hidden="true" />
          )}
        </div>

        <div className="row" style={{ gap: 12, paddingTop: 8 }}>
          <span className="thumb" style={{ width: 56, height: 56 }}>
            {cover ? <Photo id={cover} thumb /> : <Icon name="pen" size={20} />}
          </span>
          <div className="stack grow" style={{ gap: 2 }}>
            <span className="h3 ellipsis">{entry.title.trim() || 'Untitled Entry'}</span>
            <span className="small">{longDate(date)}</span>
          </div>
        </div>

        <div className="segmented" role="radiogroup" aria-label="Playback Voice" style={{ marginTop: 18 }}>
          <button role="radio" aria-checked={mode === 'voice'} disabled={!rec} onClick={() => setMode('voice')}>
            <Icon name="mic" size={15} stroke={2} />
            My Recording
          </button>
          <button role="radio" aria-checked={mode === 'read'} disabled={!canRead} onClick={() => setMode('read')}>
            <Icon name="speaker" size={15} stroke={2} />
            Read Aloud
          </button>
        </div>

        {mode === 'voice' && recs.length > 1 && (
          <div className="clip-tabs" style={{ marginTop: 12 }} role="group" aria-label="Recordings">
            {recs.map((r, i) => (
              <button key={r.id} aria-pressed={r.id === currentId} onClick={() => setCurrentId(r.id)}>
                Recording {i + 1} · {duration(r.duration)}
              </button>
            ))}
          </div>
        )}

        <div ref={textEl} className="transcript synced" style={{ paddingTop: 20 }}>
          {words.length === 0 ? (
            <p className="placeholder" style={{ margin: 0 }}>
              {mode === 'voice' ? 'No words were transcribed for this recording, but you can still listen to it.' : 'There’s no text in this entry to read aloud yet.'}
            </p>
          ) : (
            <p style={{ margin: 0 }}>
              {words.map((w, i) => (
                <span key={i}>
                  <span data-i={i} className={`w${i < nowIdx ? ' done' : i === nowIdx ? ' now' : ''}`} onClick={() => jumpTo(i)}>
                    {w.text}
                  </span>{' '}
                </span>
              ))}
            </p>
          )}
        </div>

        <div className="stack" style={{ gap: 8 }}>
          <div className="scrub">
            {peaks.map((p, i) => (
              <i key={i} className={i / BARS < progress ? 'on' : ''} style={{ height: `${Math.round(6 + p * 34)}px` }} />
            ))}
            {mode === 'voice' && (
              <input
                type="range"
                min={0}
                max={Math.max(0.1, total)}
                step={0.1}
                value={t}
                aria-label="Seek"
                aria-valuetext={`${duration(t)} of ${duration(total)}`}
                onChange={(e) => seek(Number(e.target.value))}
              />
            )}
          </div>
          {mode === 'voice' && (
            <div className="row between tiny" style={{ fontVariantNumeric: 'tabular-nums' }}>
              <span>{duration(t)}</span>
              <span>{duration(total)}</span>
            </div>
          )}
        </div>

        <div className="player">
          <button className="speed" onClick={cycleSpeed} aria-label={`Playback Speed, ${speed} Times`}>
            {speed}×
          </button>
          <button className="icon-btn" aria-label="Back 15 Seconds" disabled={mode !== 'voice'} onClick={() => seek(t - 15)} style={{ width: 52, height: 52 }}>
            <SkipIcon dir="back" />
          </button>
          <button className="big" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'} disabled={mode === 'voice' ? !src : !canRead}>
            <Icon name={playing ? 'pause' : 'play'} size={26} />
          </button>
          <button className="icon-btn" aria-label="Forward 15 Seconds" disabled={mode !== 'voice'} onClick={() => seek(t + 15)} style={{ width: 52, height: 52 }}>
            <SkipIcon dir="fwd" />
          </button>
          <a className="icon-btn outline accent" href={`#/entry/${date}/speak`} aria-label="Add More by Voice" style={{ width: 48, height: 48 }}>
            <Icon name="plus" size={20} stroke={1.9} />
          </a>
        </div>
      </div>

      {src && (
        <audio
          ref={audio}
          src={src}
          preload="auto"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => {
            setPlaying(false);
            setT(total);
          }}
          onTimeUpdate={(e) => setT(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => {
            // Recorded WebM files often report no duration until scanned once.
            const a = e.currentTarget;
            a.playbackRate = speed;
            if (!Number.isFinite(a.duration)) {
              const reset = () => {
                a.removeEventListener('durationchange', reset);
                a.currentTime = 0;
              };
              a.addEventListener('durationchange', reset);
              a.currentTime = 1e7;
            }
          }}
        />
      )}
    </div>
  );
}

function SkipIcon({ dir }: { dir: 'back' | 'fwd' }) {
  return (
    <span style={{ position: 'relative', width: 28, height: 28, display: 'inline-flex' }}>
      <Icon name={dir === 'back' ? 'back15' : 'fwd15'} size={28} stroke={1.7} />
      <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 700, paddingTop: 1 }}>15</span>
    </span>
  );
}

function lastIndexAtOrBefore(words: Word[], t: number): number {
  let idx = -1;
  for (let i = 0; i < words.length; i++) {
    if (words[i].at <= t) idx = i;
    else break;
  }
  return t <= 0 ? -1 : idx;
}

function lastCharAtOrBefore(words: Word[], c: number): number {
  let idx = 0;
  for (let i = 0; i < words.length; i++) {
    if (words[i].char <= c) idx = i;
    else break;
  }
  return idx;
}
