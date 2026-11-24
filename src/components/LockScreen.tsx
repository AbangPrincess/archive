import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal } from './Modal';
import { checkPin, getFails, getHint, hintUnlocked, lockRemaining, MAX_TRIES, recordFail, resetFails, setHint, setPin, clearPinData } from '../lib/pin';
import { wipeEverything } from '../lib/store';
import { resetSettings } from '../lib/settings';

type Mode = 'unlock' | 'setup' | 'change';
type Step = 'enter' | 'current' | 'create' | 'confirm' | 'hint';

type Props = { mode: Mode; onDone: () => void; onCancel?: () => void };

const PIN_LENGTH = 4;

export function LockScreen({ mode, onDone, onCancel }: Props) {
  const [step, setStep] = useState<Step>(mode === 'unlock' ? 'enter' : mode === 'setup' ? 'create' : 'current');
  const [digits, setDigits] = useState('');
  const [first, setFirst] = useState('');
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [shake, setShake] = useState(false);
  const [lockLeft, setLockLeft] = useState(() => lockRemaining());
  const [hintShown, setHintShown] = useState(false);
  const [hintAvailable, setHintAvailable] = useState(() => hintUnlocked() && Boolean(getHint()));
  const [forgot, setForgot] = useState(false);
  const busy = useRef(false);

  const locked = lockLeft > 0;
  const checking = step === 'enter' || step === 'current';

  useEffect(() => {
    if (!locked) return;
    const t = window.setInterval(() => {
      const left = lockRemaining();
      setLockLeft(left);
      if (left <= 0) setMessage(null);
    }, 1000);
    return () => window.clearInterval(t);
  }, [locked]);

  const fail = useCallback((text: string) => {
    setShake(true);
    window.setTimeout(() => setShake(false), 420);
    setDigits('');
    setMessage({ text, error: true });
  }, []);

  const submit = useCallback(
    async (pin: string) => {
      if (busy.current) return;
      busy.current = true;
      try {
        if (checking) {
          if (await checkPin(pin)) {
            resetFails();
            setHintAvailable(false);
            if (step === 'enter') onDone();
            else {
              setDigits('');
              setMessage(null);
              setStep('create');
            }
            return;
          }
          const fails = recordFail();
          setHintAvailable(hintUnlocked() && Boolean(getHint()));
          if (fails >= MAX_TRIES) {
            setLockLeft(lockRemaining());
            fail('');
          } else {
            const left = MAX_TRIES - fails;
            fail(`Wrong PIN. ${left} ${left === 1 ? 'try' : 'tries'} left.`);
          }
        } else if (step === 'create') {
          setFirst(pin);
          setDigits('');
          setMessage(null);
          setStep('confirm');
        } else if (step === 'confirm') {
          if (pin !== first) {
            setStep('create');
            setFirst('');
            fail('Those PINs didn’t match. Please try again.');
            return;
          }
          if (mode === 'setup') {
            setDigits('');
            setMessage(null);
            setStep('hint');
          } else {
            await setPin(pin);
            onDone();
          }
        }
      } finally {
        busy.current = false;
      }
    },
    [checking, step, first, mode, onDone, fail],
  );

  const press = useCallback(
    (d: string) => {
      if (locked || step === 'hint') return;
      setDigits((cur) => (cur.length >= PIN_LENGTH ? cur : cur + d));
    },
    [locked, step],
  );

  useEffect(() => {
    if (digits.length !== PIN_LENGTH) return;
    const t = window.setTimeout(() => submit(digits), 120);
    return () => window.clearTimeout(t);
  }, [digits, submit]);

  const erase = useCallback(() => setDigits((cur) => cur.slice(0, -1)), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (forgot || target.closest('input, textarea')) return;
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') erase();
      else if (e.key === 'Escape' && onCancel) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [press, erase, onCancel, forgot]);

  const secs = Math.ceil(lockLeft / 1000);
  const mins = Math.max(1, Math.ceil(secs / 60));
  const title = {
    enter: 'Enter Your PIN',
    current: 'Enter Your Current PIN',
    create: mode === 'setup' ? 'Create a PIN' : 'Choose a New PIN',
    confirm: mode === 'setup' ? 'Confirm Your PIN' : 'Confirm Your New PIN',
    hint: 'Add a PIN Hint',
  }[step];
  const intro =
    step === 'create' && mode === 'setup'
      ? 'Choose 4 digits to keep your journal private on this device.'
      : step === 'enter' && getFails() === 0 && !locked
        ? 'Welcome back.'
        : '';

  if (step === 'hint') return <HintStep pin={first} onSaved={onDone} />;

  return (
    <div className="lock" role="dialog" aria-modal="true" aria-labelledby="lock-title">
      {onCancel && (
        <button className="btn btn-ghost" style={{ position: 'absolute', top: 'calc(var(--safe-t) + 16px)', left: 'var(--gutter)', minHeight: 40 }} onClick={onCancel}>
          Cancel
        </button>
      )}
      <div className="lock-inner">
        <span className="eyebrow">Archive</span>
        <h1 id="lock-title" className="h2" style={{ marginTop: 6 }}>
          {title}
        </h1>
        <p className={`msg${message?.error && !locked ? ' error' : ''}`} aria-live="polite">
          {locked ? `You entered the wrong code too many times. Please wait about ${mins} ${mins === 1 ? 'minute' : 'minutes'} and try again. (${secs})` : (message?.text ?? intro)}
        </p>
        <div className={`dots${shake ? ' shake' : ''}`} aria-label={`${digits.length} of ${PIN_LENGTH} digits entered`} role="img">
          {Array.from({ length: PIN_LENGTH }, (_, i) => (
            <i key={i} className={i < digits.length ? 'on' : ''} />
          ))}
        </div>
        <div className="keypad" role="group" aria-label="Number Pad">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
            <button key={d} className="key" onClick={() => press(d)} disabled={locked} aria-label={d}>
              {d}
            </button>
          ))}
          <span className="key-spacer" aria-hidden="true" />
          <button className="key" onClick={() => press('0')} disabled={locked} aria-label="0">
            0
          </button>
          <button className="key erase" onClick={erase} disabled={locked || digits.length === 0} aria-label="Delete Digit">
            <svg viewBox="0 0 56 56" aria-hidden="true">
              <path d="M28 3C40 12 53 20 53 28C53 36 40 44 28 53C16 44 3 36 3 28C3 20 16 12 28 3Z" fill="var(--ink)" />
              <path d="M31.5 21l-7 7 7 7" fill="none" stroke="var(--bg)" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
        <div className="below">
          {checking && hintAvailable && !hintShown && (
            <button className="link-btn" onClick={() => setHintShown(true)}>
              Need a Hint?
            </button>
          )}
          {checking && hintAvailable && hintShown && (
            <>
              <p className="hint-text" aria-live="polite">
                Hint: {getHint()}
              </p>
              <button className="link-btn" style={{ color: 'var(--muted)', fontWeight: 500 }} onClick={() => setForgot(true)}>
                Forgot Your PIN?
              </button>
            </>
          )}
        </div>
      </div>
      {forgot && <ForgotModal onClose={() => setForgot(false)} />}
    </div>
  );
}

function HintStep({ pin, onSaved }: { pin: string; onSaved: () => void }) {
  const [hint, setHintText] = useState('');
  const [error, setError] = useState('');
  const save = async () => {
    const h = hint.trim();
    if (h.length < 2) return setError('Please write a short hint.');
    if (h.replace(/\D/g, '').includes(pin)) return setError('Your hint can’t include the PIN itself.');
    await setPin(pin);
    setHint(h);
    try {
      await navigator.storage?.persist?.();
    } catch {
      /* optional */
    }
    onSaved();
  };
  return (
    <div className="lock" role="dialog" aria-modal="true" aria-labelledby="hint-title">
      <form
        className="lock-inner"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <span className="eyebrow">Archive</span>
        <h1 id="hint-title" className="h2" style={{ marginTop: 6 }}>
          Add a PIN Hint
        </h1>
        <p className="msg">If you get your PIN wrong 4 times, this hint will appear to help you remember.</p>
        <div className="field lock-field">
          <label htmlFor="pin-hint">PIN Hint</label>
          <input id="pin-hint" value={hint} maxLength={80} autoComplete="off" onChange={(e) => (setHintText(e.target.value), setError(''))} placeholder="e.g. My Lola’s Birthday" />
          {error ? <span className="error">{error}</span> : <span className="help">Don’t type the PIN itself.</span>}
        </div>
        <button className="btn btn-primary" type="submit" style={{ marginTop: 24, width: '100%' }}>
          Save and Open Journal
        </button>
      </form>
    </div>
  );
}

function ForgotModal({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState('');
  return (
    <Modal title="Forgot Your PIN?" onClose={onClose} small>
      <p>Your journal is stored only on this device and the PIN can’t be recovered. The only way back in is to erase this journal and start fresh. This deletes every entry, photo and recording, and it can’t be undone.</p>
      <div className="field" style={{ marginTop: 12 }}>
        <label htmlFor="erase-confirm">Type ERASE to Confirm</label>
        <input id="erase-confirm" value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" autoCapitalize="characters" />
      </div>
      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button
          className="btn btn-danger"
          disabled={text.trim().toUpperCase() !== 'ERASE'}
          onClick={async () => {
            await wipeEverything();
            clearPinData();
            resetSettings();
            window.location.replace(window.location.pathname);
          }}
        >
          Erase Journal
        </button>
      </div>
    </Modal>
  );
}
