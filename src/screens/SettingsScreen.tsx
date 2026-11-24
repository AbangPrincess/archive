import { useEffect, useState } from 'react';
import { Icon } from '../components/Icon';
import { Modal } from '../components/Modal';
import { LockScreen } from '../components/LockScreen';
import { toast } from '../components/Toast';
import { PrivacyPolicy, TermsOfUse } from '../content/Legal';
import { useEntries, wipeEverything } from '../lib/store';
import { clearPinData, getHint, setHint } from '../lib/pin';
import { resetSettings, setSettings, SPEECH_LANGUAGES, useSettings } from '../lib/settings';
import { go, tabHome } from '../lib/router';
import { todayKey } from '../lib/dates';

const PORTFOLIO = 'https://princessabang.netlify.app';
const VERSION = '1.0.0';

export function SettingsScreen({ onLockNow }: { onLockNow: () => void }) {
  const { entries } = useEntries();
  const settings = useSettings();
  const [usage, setUsage] = useState<string>('—');
  const [modal, setModal] = useState<'privacy' | 'terms' | 'hint' | 'wipe' | null>(null);
  const [changingPin, setChangingPin] = useState(false);

  useEffect(() => {
    navigator.storage
      ?.estimate?.()
      .then(({ usage: u }) => setUsage(formatBytes(u ?? 0)))
      .catch(() => undefined);
  }, [entries]);

  const exportEntries = () => {
    const data = {
      app: 'Archive',
      exportedAt: new Date().toISOString(),
      note: 'Text export. Photos and voice recordings stay in the app on your device.',
      entries: entries.map(({ date, title, body, favorite, place, recordings, photoIds, createdAt, updatedAt }) => ({
        date,
        title,
        body,
        favorite,
        place: place ?? null,
        photos: photoIds.length,
        recordings: recordings.map((r) => ({ seconds: Math.round(r.duration), transcript: r.segments.map((s) => s.text).join(' ') })),
        createdAt: new Date(createdAt).toISOString(),
        updatedAt: new Date(updatedAt).toISOString(),
      })),
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `archive-entries-${todayKey()}.json`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  return (
    <div className="page" style={{ paddingBottom: 0 }}>
      <div className="subbar">
        <div className="wrap narrow subbar-inner">
          <button className="icon-btn" aria-label="Back to Archive" onClick={() => go(tabHome())}>
            <Icon name="chevL" stroke={2} />
          </button>
          <h1 className="subbar-title h3">Settings</h1>
          <span aria-hidden="true" />
        </div>
      </div>

      <main className="wrap narrow">
        <h2 className="group-label eyebrow">Security</h2>
        <div className="group">
          <button className="setting" onClick={() => setChangingPin(true)}>
            <span className="label">Change PIN</span>
            <span className="value">
              <Icon name="chevR" size={18} stroke={2} />
            </span>
          </button>
          <button className="setting" onClick={() => setModal('hint')}>
            <span className="label">PIN Hint</span>
            <span className="value grow" style={{ justifyContent: 'flex-end' }}>
              <span className="ellipsis">{getHint() ? 'Set' : 'Not Set'}</span>
              <Icon name="chevR" size={18} stroke={2} />
            </span>
          </button>
          <label className="setting">
            <span className="label">Auto-Lock</span>
            <select value={settings.autoLock} onChange={(e) => setSettings({ autoLock: Number(e.target.value) })}>
              <option value={0}>Right Away</option>
              <option value={1}>After 1 Minute</option>
              <option value={5}>After 5 Minutes</option>
              <option value={15}>After 15 Minutes</option>
            </select>
          </label>
          <button className="setting" onClick={onLockNow}>
            <span className="label">Lock Now</span>
            <span className="value">
              <Icon name="lock" size={18} />
            </span>
          </button>
        </div>

        <h2 className="group-label eyebrow">Voice</h2>
        <div className="group">
          <label className="setting">
            <span className="label">Speech Language</span>
            <select value={settings.speechLang} onChange={(e) => setSettings({ speechLang: e.target.value })}>
              {SPEECH_LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <h2 className="group-label eyebrow">Your Journal</h2>
        <div className="group">
          <div className="setting">
            <span className="label">Entries</span>
            <span className="value">{entries.length}</span>
          </div>
          <div className="setting">
            <span className="label">Space Used on This Device</span>
            <span className="value">{usage}</span>
          </div>
          <button className="setting" onClick={exportEntries} disabled={!entries.length}>
            <span className="label">Export Entries</span>
            <span className="value">
              <Icon name="download" size={18} />
            </span>
          </button>
          <button className="setting danger" onClick={() => setModal('wipe')}>
            <span className="label">Delete All Data</span>
            <span className="value">
              <Icon name="trash" size={18} />
            </span>
          </button>
        </div>

        <h2 className="group-label eyebrow">About</h2>
        <div className="group">
          <div className="setting">
            <span className="label">Version</span>
            <span className="value">{VERSION}</span>
          </div>
          <div className="setting">
            <span className="label">Map Data</span>
            <span className="value">© OpenStreetMap Contributors</span>
          </div>
        </div>

        <footer className="legal">
          <span>
            © 2026{' '}
            <a className="owner" href={PORTFOLIO} target="_blank" rel="noopener noreferrer">
              Princess Abang
            </a>
            . All rights reserved.
          </span>
          <span className="links">
            <button onClick={() => setModal('privacy')}>Privacy Policy</button>
            <span aria-hidden="true">•</span>
            <button onClick={() => setModal('terms')}>Terms of Use</button>
          </span>
        </footer>
      </main>

      {modal === 'privacy' && (
        <Modal title="Privacy Policy" onClose={() => setModal(null)}>
          <PrivacyPolicy />
        </Modal>
      )}
      {modal === 'terms' && (
        <Modal title="Terms of Use" onClose={() => setModal(null)}>
          <TermsOfUse />
        </Modal>
      )}
      {modal === 'hint' && <HintEditor onClose={() => setModal(null)} />}
      {modal === 'wipe' && <WipeModal onClose={() => setModal(null)} />}
      {changingPin && (
        <LockScreen
          mode="change"
          onCancel={() => setChangingPin(false)}
          onDone={() => {
            setChangingPin(false);
            toast('Your PIN was changed.');
          }}
        />
      )}
    </div>
  );
}

function HintEditor({ onClose }: { onClose: () => void }) {
  const [hint, setText] = useState(getHint());
  return (
    <Modal title="PIN Hint" onClose={onClose} small>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (hint.trim().length < 2) return;
          setHint(hint);
          toast('Your hint was saved.');
          onClose();
        }}
      >
        <div className="field">
          <label htmlFor="hint-edit">Hint</label>
          <input id="hint-edit" value={hint} maxLength={80} onChange={(e) => setText(e.target.value)} autoComplete="off" />
          <span className="help">Shown after 4 wrong tries. Don’t type the PIN itself.</span>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={hint.trim().length < 2}>
            Save Hint
          </button>
        </div>
      </form>
    </Modal>
  );
}

function WipeModal({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState('');
  return (
    <Modal title="Delete All Data?" onClose={onClose} small>
      <p>This permanently erases every entry, photo, recording, your PIN and your settings from this device. It can’t be undone.</p>
      <div className="field" style={{ marginTop: 12 }}>
        <label htmlFor="wipe-confirm">Type DELETE to Confirm</label>
        <input id="wipe-confirm" value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" autoCapitalize="characters" />
      </div>
      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button
          className="btn btn-danger"
          disabled={text.trim().toUpperCase() !== 'DELETE'}
          onClick={async () => {
            await wipeEverything();
            clearPinData();
            resetSettings();
            window.location.replace(window.location.pathname);
          }}
        >
          Delete Everything
        </button>
      </div>
    </Modal>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}
