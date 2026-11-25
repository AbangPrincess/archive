import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import { Photo } from './Photo';

type Phase = 'idle' | 'out' | 'in';
const FLIP_MS = 170;

/**
 * The day's photo dump as a stack of instant photos: tap the top photo and it
 * flips over to reveal the next one. The corner button opens the photo itself.
 */
export function InstantStack({ ids, onOpen }: { ids: string[]; onOpen: (id: string) => void }) {
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>('idle');
  const timer = useRef(0);
  const n = ids.length;
  const i = Math.min(index, n - 1);

  useEffect(() => {
    if (index > n - 1) setIndex(Math.max(0, n - 1));
  }, [index, n]);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const flip = () => {
    if (n < 2) return onOpen(ids[i]);
    if (phase !== 'idle') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return setIndex((x) => (x + 1) % n);
    setPhase('out');
    timer.current = window.setTimeout(() => {
      setIndex((x) => (x + 1) % n);
      setPhase('in');
      // Let the new photo paint edge-on, then swing it back to face the viewer.
      timer.current = window.setTimeout(() => setPhase('idle'), 34);
    }, FLIP_MS);
  };

  const behind = [ids[(i + 1) % n], ids[(i + 2) % n]].slice(0, Math.max(0, n - 1));

  return (
    <div className="instants">
      <div className="instant-stage">
        {behind
          .map((id, k) => (
            <div key={`${id}-${k}`} className={`instant-card back${k + 1}`} aria-hidden="true">
              <Photo id={id} thumb />
            </div>
          ))
          .reverse()}
        <button
          className={`instant-card top${phase === 'out' ? ' out' : phase === 'in' ? ' in' : ''}`}
          onClick={flip}
          aria-label={n > 1 ? `Photo ${i + 1} of ${n}. Tap for the Next Photo` : 'Open Photo'}
        >
          <Photo id={ids[i]} alt={`Photo ${i + 1} of ${n}`} />
        </button>
        <button className="instant-open" aria-label="View Photo" onClick={() => onOpen(ids[i])}>
          <Icon name="image" size={16} stroke={2} />
        </button>
        <span className="instant-count" aria-hidden="true">
          {i + 1} / {n}
        </span>
      </div>
      {n > 1 && (
        <div className="instant-dots" aria-hidden="true">
          {ids.map((id, k) => (
            <i key={id} className={k === i ? 'on' : ''} />
          ))}
        </div>
      )}
    </div>
  );
}
