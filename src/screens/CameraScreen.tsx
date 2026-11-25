import { useEffect, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { toast } from '../components/Toast';
import { addPhotos, photoToast, useEntry, useBlobUrl } from '../lib/store';
import { MAX_PHOTOS } from '../lib/types';
import { go } from '../lib/router';

type State = 'starting' | 'live' | 'error';

/** Opens straight to the camera. The lower-left button picks photos from the gallery instead. */
export function CameraScreen({ date }: { date: string }) {
  const entry = useEntry(date);
  const [state, setState] = useState<State>('starting');
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [canFlip, setCanFlip] = useState(false);
  const [added, setAdded] = useState(0);
  const [flash, setFlash] = useState(false);
  const [busy, setBusy] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const lastId = entry.photoIds[entry.photoIds.length - 1];
  const lastThumb = useBlobUrl(lastId, true);
  const count = entry.photoIds.length;
  const full = count >= MAX_PHOTOS;

  useEffect(() => {
    let live = true;
    (async () => {
      setState('starting');
      stream.current?.getTracks().forEach((t) => t.stop());
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('unsupported');
        const s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (!live) return s.getTracks().forEach((t) => t.stop());
        stream.current = s;
        if (video.current) {
          video.current.srcObject = s;
          await video.current.play().catch(() => undefined);
        }
        const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
        setCanFlip(devices.filter((d) => d.kind === 'videoinput').length > 1);
        setState('live');
      } catch {
        if (live) setState('error');
      }
    })();
    return () => {
      live = false;
    };
  }, [facing]);

  useEffect(() => () => stream.current?.getTracks().forEach((t) => t.stop()), []);

  const close = () => go(`/entry/${date}`);

  const snap = async () => {
    const v = video.current;
    if (!v || !v.videoWidth || busy) return;
    if (full) return toast(photoToast(0, 1));
    setBusy(true);
    setFlash(true);
    window.setTimeout(() => setFlash(false), 60);
    const canvas = document.createElement('canvas');
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      if (facing === 'user') {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(v, 0, 0);
    }
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.92));
    if (blob) {
      const { added: n } = await addPhotos(date, [blob]);
      setAdded((x) => x + n);
    }
    setBusy(false);
  };

  const fromGallery = async (files: File[]) => {
    if (!files.length) return;
    setBusy(true);
    const { added: n, skipped } = await addPhotos(date, files);
    setBusy(false);
    toast(photoToast(n, skipped));
    if (n) go(`/entry/${date}`);
  };

  return (
    <div className="camera" role="dialog" aria-modal="true" aria-label="Camera">
      <video ref={video} className={facing === 'user' ? 'mirror' : ''} playsInline muted autoPlay aria-hidden="true" />
      <div className={`flash${flash ? ' on' : ''}`} aria-hidden="true" />

      <div className="cam-top">
        <button className="icon-btn" aria-label="Close Camera" onClick={close}>
          <Icon name="x" stroke={2} />
        </button>
        <span className="cam-count" role="status">
          {count} of {MAX_PHOTOS} Photos
        </span>
        {canFlip && state === 'live' ? (
          <button className="icon-btn" aria-label="Switch Camera" onClick={() => setFacing((f) => (f === 'user' ? 'environment' : 'user'))}>
            <Icon name="flip" size={20} stroke={1.9} />
          </button>
        ) : (
          <span style={{ width: 44 }} />
        )}
      </div>

      {state === 'error' && (
        <div className="cam-message">
          <Icon name="camera" size={32} />
          <h2 className="h3" style={{ color: '#fff' }}>
            Camera Unavailable
          </h2>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>Camera access is blocked or not supported here. You can still add photos from your gallery.</p>
          <button className="btn btn-accent" onClick={() => picker.current?.click()}>
            <Icon name="image" size={18} />
            Choose From Gallery
          </button>
        </div>
      )}

      <div className="cam-bottom">
        <button className="gallery-btn" aria-label="Choose From Gallery" onClick={() => picker.current?.click()} disabled={busy}>
          {lastThumb ? <img src={lastThumb} alt="" /> : <Icon name="image" size={22} />}
        </button>
        <button className="shutter" aria-label={full ? 'Photo Limit Reached' : 'Take Photo'} onClick={snap} disabled={state !== 'live' || busy || full}>
          <span />
        </button>
        {added > 0 ? (
          <button className="cam-done" onClick={close}>
            Done
          </button>
        ) : (
          <span style={{ width: 52 }} />
        )}
      </div>

      <input
        ref={picker}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = '';
          fromGallery(files);
        }}
      />
    </div>
  );
}
