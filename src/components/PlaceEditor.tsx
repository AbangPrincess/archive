import { useState } from 'react';
import { Modal } from './Modal';
import { Icon } from './Icon';
import { locateMe } from '../lib/geo';
import type { Place } from '../lib/types';

type Props = { place?: Place; onSave: (p: Place | undefined) => void; onClose: () => void };

/** Lets the person rename, refresh or remove the place attached to an entry. */
export function PlaceEditor({ place, onSave, onClose }: Props) {
  const [name, setName] = useState(place?.name ?? '');
  const [coords, setCoords] = useState(place ? { lat: place.lat, lng: place.lng } : null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const useCurrent = async () => {
    setBusy(true);
    setError('');
    try {
      const p = await locateMe();
      setName(p.name);
      setCoords({ lat: p.lat, lng: p.lng });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Location" onClose={onClose} small>
      <div className="field">
        <label htmlFor="place-name">Place Name</label>
        <input id="place-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="e.g. Salcedo Saturday Market" />
        {error ? <span className="error">{error}</span> : <span className="help">{coords ? 'Pinned on your Places map.' : 'Use your current location to pin it on the map.'}</span>}
      </div>
      <button className="pill" style={{ marginTop: 12 }} onClick={useCurrent} disabled={busy}>
        <Icon name="locate" size={16} stroke={1.9} />
        {busy ? 'Finding You…' : 'Use Current Location'}
      </button>
      <div className="modal-actions">
        {place && (
          <button className="btn btn-ghost" style={{ marginRight: 'auto', color: 'var(--rec)' }} onClick={() => (onSave(undefined), onClose())}>
            Remove
          </button>
        )}
        <button className="btn btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button
          className="btn btn-primary"
          disabled={!name.trim() || !coords}
          onClick={() => {
            if (coords) onSave({ name: name.trim(), ...coords });
            onClose();
          }}
        >
          Save
        </button>
      </div>
    </Modal>
  );
}
