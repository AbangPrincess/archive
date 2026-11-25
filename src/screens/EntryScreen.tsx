import { useEffect, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { Photo } from '../components/Photo';
import { Confirm, Modal } from '../components/Modal';
import { PlaceEditor } from '../components/PlaceEditor';
import { toast } from '../components/Toast';
import { deleteEntryCompletely, findEntry, removePhoto, removeRecording, saveEntry, updateEntry, useEntry, useBlobUrl } from '../lib/store';
import { duration, longDate, timeOf, weekdayName } from '../lib/dates';
import { go, tabHome } from '../lib/router';
import { locateMe } from '../lib/geo';
import { useAutoGrow } from '../lib/useAutoGrow';
import { coverOf, hasContent, MAX_PHOTOS, type Recording } from '../lib/types';
import { InstantStack } from '../components/InstantStack';

export function EntryScreen({ date, focusBody }: { date: string; focusBody: boolean }) {
  const entry = useEntry(date);
  const [title, setTitle] = useState(entry.title);
  const [body, setBody] = useState(entry.body);
  const [viewer, setViewer] = useState<string | null>(null);
  const [placeOpen, setPlaceOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteRec, setDeleteRec] = useState<Recording | null>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const dirty = useRef<{ title?: string; body?: string }>({});
  const timer = useRef(0);
  useAutoGrow(titleRef, title);
  useAutoGrow(bodyRef, body);

  // Pick up text added elsewhere (e.g. after dictation) when nothing is being typed here.
  useEffect(() => {
    if (dirty.current.title === undefined) setTitle(entry.title);
    if (dirty.current.body === undefined) setBody(entry.body);
  }, [entry.title, entry.body]);

  useEffect(() => {
    if (!focusBody) return;
    const el = bodyRef.current;
    if (el) {
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
      el.scrollIntoView({ block: 'center' });
    }
  }, [focusBody]);

  const flush = () => {
    window.clearTimeout(timer.current);
    const patch = dirty.current;
    if (patch.title === undefined && patch.body === undefined) return;
    dirty.current = {};
    void updateEntry(date, (e) => ({ ...e, ...(patch.title !== undefined && { title: patch.title }), ...(patch.body !== undefined && { body: patch.body }) }));
  };
  const queue = (patch: { title?: string; body?: string }) => {
    dirty.current = { ...dirty.current, ...patch };
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, 450);
  };
  const flushRef = useRef(flush);
  flushRef.current = flush;
  useEffect(() => () => flushRef.current(), []);

  const cover = coverOf(entry);
  const photos = entry.photoIds;
  const exists = hasContent(entry);

  const addLocation = async () => {
    if (entry.place) return setPlaceOpen(true);
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

  const toggleFavorite = () => {
    flush();
    const e = findEntry(date);
    if (!hasContent(e)) return toast('Write something first, then you can favorite this day.');
    void saveEntry({ ...e, favorite: !e.favorite });
  };

  return (
    <div className="page">
      <div className="subbar">
        <div className="wrap narrow subbar-inner wide">
          <button className="icon-btn" aria-label="Back to Archive" onClick={() => (flush(), go(tabHome()))}>
            <Icon name="chevL" stroke={2} />
          </button>
          <div className="subbar-title">
            <div className="eyebrow">{weekdayName(date)}</div>
            <div className="main ellipsis">{longDate(date)}</div>
          </div>
          <div className="row" style={{ justifySelf: 'end' }}>
            <button
              className={`icon-btn${entry.place ? ' accent' : ''}`}
              aria-label={locating ? 'Finding Your Location' : entry.place ? `Location: ${entry.place.name}` : 'Add Location'}
              onClick={addLocation}
              disabled={locating}
              style={locating ? { opacity: 0.5 } : undefined}
            >
              <Icon name="pin" />
            </button>
            <button
              className="icon-btn accent"
              aria-label={entry.favorite ? 'Remove from Favorites' : 'Add to Favorites'}
              aria-pressed={entry.favorite}
              onClick={toggleFavorite}
            >
              <Icon name={entry.favorite ? 'heartFill' : 'heart'} />
            </button>
          </div>
        </div>
      </div>

      <main className="wrap narrow stack" style={{ gap: 20, paddingTop: 4 }}>
        {cover ? (
          <figure className="hero" style={{ margin: 0 }}>
            <button style={{ display: 'block', width: '100%', height: '100%' }} onClick={() => setViewer(cover)} aria-label="Open Photo of the Day">
              <Photo id={cover} alt="Photo of the day" />
            </button>
            <span className="label">Photo of the Day</span>
            {entry.place && (
              <button className="caption" onClick={() => setPlaceOpen(true)} aria-label={`Location: ${entry.place.name}. Edit Location`}>
                <Icon name="pin" size={14} stroke={2} />
                <span className="ellipsis">
                  {entry.place.name} · {timeOf(entry.createdAt)}
                </span>
              </button>
            )}
          </figure>
        ) : (
          <a className="hero-empty" href={`#/entry/${date}/camera`}>
            <Icon name="camera" size={28} />
            <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>Add a Photo of the Day</span>
            <span className="small">Take one now or choose from your gallery.</span>
          </a>
        )}

        <div className="stack" style={{ gap: 10 }}>
          <label className="sr-only" htmlFor="entry-title">
            Headline
          </label>
          <textarea
            id="entry-title"
            ref={titleRef}
            className="title-input"
            rows={1}
            value={title}
            maxLength={120}
            placeholder="Give Today a Headline"
            onChange={(e) => {
              setTitle(e.target.value.replace(/\n/g, ' '));
              queue({ title: e.target.value.replace(/\n/g, ' ') });
            }}
            onBlur={flush}
          />
        </div>

        {entry.recordings.map((r, i) => (
          <RecordingCard key={r.id} date={date} rec={r} index={i} total={entry.recordings.length} onDelete={() => setDeleteRec(r)} />
        ))}
        {entry.recordings.length === 0 && body.trim() && 'speechSynthesis' in window && (
          <a className="rec-card" href={`#/entry/${date}/listen`} onClick={flush} style={{ paddingRight: 14 }}>
            <span className="play">
              <Icon name="play" size={18} />
            </span>
            <span className="grow stack" style={{ gap: 2 }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>Read Aloud</span>
              <span className="tiny">Listen to this entry read back to you.</span>
            </span>
            <Icon name="speaker" size={20} style={{ color: 'var(--muted)' }} />
          </a>
        )}

        <article className="stack" style={{ gap: 10 }}>
          {exists && (
            <span className="row tiny" style={{ gap: 6, fontWeight: 500 }}>
              <Icon name={entry.spoken ? 'mic' : 'pen'} size={14} stroke={2} />
              {entry.spoken ? 'Spoken' : 'Written'} · Edited {timeOf(entry.updatedAt)}
            </span>
          )}
          <label className="sr-only" htmlFor="entry-body">
            Diary Text
          </label>
          <textarea
            id="entry-body"
            ref={bodyRef}
            className="body-input"
            value={body}
            placeholder="Write About Your Day…"
            onChange={(e) => {
              setBody(e.target.value);
              queue({ body: e.target.value });
            }}
            onBlur={flush}
          />
        </article>

        <section className="stack" style={{ gap: 14 }} aria-label="Photo Dump">
          <div className="row between" style={{ gap: 12 }}>
            <h2 className="h3">Photo Dump</h2>
            <span className="tiny" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {photos.length} of {MAX_PHOTOS}
            </span>
          </div>
          {photos.length > 0 ? (
            <InstantStack ids={photos} onOpen={setViewer} />
          ) : (
            <a className="hero-empty" href={`#/entry/${date}/camera`} style={{ aspectRatio: '4 / 3' }}>
              <Icon name="camera" size={26} />
              <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>Add Up to 10 Photos</span>
              <span className="small">Tap through them like a stack of instants.</span>
            </a>
          )}
          {photos.length > 0 && photos.length < MAX_PHOTOS && (
            <a className="pill" href={`#/entry/${date}/camera`} style={{ alignSelf: 'center' }}>
              <Icon name="camera" size={16} stroke={1.9} />
              Add Photos
            </a>
          )}
        </section>

        {exists && (
          <div style={{ textAlign: 'center', paddingTop: 8 }}>
            <button className="link-btn" style={{ color: 'var(--rec)' }} onClick={() => setConfirmDelete(true)}>
              Delete Entry
            </button>
          </div>
        )}
      </main>

      <div className="dock">
        <div className="toolbar" role="toolbar" aria-label="Add to This Entry">
          <button
            className="icon-btn"
            aria-label="Type"
            onClick={() => {
              const el = bodyRef.current;
              el?.focus();
              el?.setSelectionRange(el.value.length, el.value.length);
              el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
            }}
          >
            <Icon name="keyboard" />
          </button>
          <a className="icon-btn main" href={`#/entry/${date}/speak?auto=1`} aria-label="Start Recording" onClick={flush}>
            <Icon name="mic" size={26} stroke={1.9} />
          </a>
          <a className="icon-btn" href={`#/entry/${date}/camera`} aria-label="Camera" onClick={flush}>
            <Icon name="camera" />
          </a>
        </div>
      </div>

      {viewer && <PhotoViewer date={date} ids={photos} start={viewer} cover={cover} onClose={() => setViewer(null)} />}
      {placeOpen && <PlaceEditor place={entry.place} onClose={() => setPlaceOpen(false)} onSave={(place) => updateEntry(date, (e) => ({ ...e, place }))} />}
      {confirmDelete && (
        <Confirm
          title="Delete This Entry?"
          message="This removes the text, photos, place and recordings for this day from your device. It can’t be undone."
          confirmLabel="Delete Entry"
          danger
          onConfirm={async () => {
            await deleteEntryCompletely(date);
            go(tabHome());
          }}
          onClose={() => setConfirmDelete(false)}
        />
      )}
      {deleteRec && (
        <Confirm
          title="Delete Recording?"
          message="The audio for this recording will be removed. Any words it added to your entry stay in the text."
          confirmLabel="Delete"
          danger
          onConfirm={() => removeRecording(date, deleteRec.id)}
          onClose={() => setDeleteRec(null)}
        />
      )}
    </div>
  );
}

function RecordingCard({ date, rec, index, total, onDelete }: { date: string; rec: Recording; index: number; total: number; onDelete: () => void }) {
  const bars = Array.from({ length: 28 }, (_, i) => 5 + ((rec.id.charCodeAt(i % rec.id.length) * (i + 3)) % 11));
  return (
    <div className="rec-card">
      <a className="play" href={`#/entry/${date}/listen?r=${rec.id}`} aria-label={`Play Recording ${total > 1 ? index + 1 : ''}`.trim()}>
        <Icon name="play" size={18} />
      </a>
      <a className="grow stack" style={{ gap: 6 }} href={`#/entry/${date}/listen?r=${rec.id}`}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>{total > 1 ? `Recording ${index + 1}` : 'Hear Yourself Tell It'}</span>
        <span className="wave" aria-hidden="true">
          {bars.map((h, i) => (
            <i key={i} style={{ height: h }} />
          ))}
        </span>
      </a>
      <span className="small" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {duration(rec.duration)}
      </span>
      <button className="icon-btn" aria-label="Delete Recording" onClick={onDelete} style={{ color: 'var(--muted)' }}>
        <Icon name="trash" size={18} />
      </button>
    </div>
  );
}

function PhotoViewer({ date, ids, start, cover, onClose }: { date: string; ids: string[]; start: string; cover?: string; onClose: () => void }) {
  const [index, setIndex] = useState(Math.max(0, ids.indexOf(start)));
  const [confirm, setConfirm] = useState(false);
  const id = ids[index];
  const url = useBlobUrl(id);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (confirm) return;
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') setIndex((i) => Math.min(ids.length - 1, i + 1));
      if (e.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ids.length, onClose, confirm]);

  useEffect(() => {
    if (!id) onClose();
  }, [id, onClose]);
  if (!id) return null;

  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label="Photo Viewer">
      <div className="top">
        <button className="icon-btn" aria-label="Close" onClick={onClose}>
          <Icon name="x" stroke={2} />
        </button>
        <span className="small" style={{ color: 'rgba(255,255,255,0.8)' }}>
          {index + 1} of {ids.length}
        </span>
        <span style={{ display: 'flex', gap: 4 }}>
          <button className="icon-btn" aria-label="Previous Photo" disabled={index === 0} onClick={() => setIndex(index - 1)}>
            <Icon name="chevL" stroke={2} />
          </button>
          <button className="icon-btn" aria-label="Next Photo" disabled={index === ids.length - 1} onClick={() => setIndex(index + 1)}>
            <Icon name="chevR" stroke={2} />
          </button>
        </span>
      </div>
      <div className="stage">{url && <img src={url} alt={`Photo ${index + 1} from ${longDate(date)}`} />}</div>
      <div className="bottom">
        <button
          className="btn"
          disabled={id === cover}
          onClick={async () => {
            await updateEntry(date, (e) => ({ ...e, coverId: id }));
            toast('Set as Photo of the Day.');
          }}
        >
          <Icon name="star" size={18} />
          {id === cover ? 'Photo of the Day' : 'Set as Photo of the Day'}
        </button>
        <button className="btn" onClick={() => setConfirm(true)}>
          <Icon name="trash" size={18} />
          Delete Photo
        </button>
      </div>
      {confirm && (
        <Modal title="Delete Photo?" onClose={() => setConfirm(false)} small>
          <p>This photo will be removed from your journal on this device.</p>
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={() => setConfirm(false)}>
              Cancel
            </button>
            <button
              className="btn btn-danger"
              onClick={async () => {
                setConfirm(false);
                if (index >= ids.length - 1) setIndex(Math.max(0, index - 1));
                await removePhoto(date, id);
              }}
            >
              Delete Photo
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
