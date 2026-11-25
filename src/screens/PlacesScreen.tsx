import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { TopBar } from '../components/TopBar';
import { Icon } from '../components/Icon';
import { Photo } from '../components/Photo';
import { blobUrl, useEntries } from '../lib/store';
import { currentPosition } from '../lib/geo';
import { mediumDate, shortDate } from '../lib/dates';
import { coverOf, type Entry } from '../lib/types';
import { toast } from '../components/Toast';

type Group = { key: string; name: string; lat: number; lng: number; entries: Entry[] };
type Range = 'all' | 'year' | 'month';

const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors';

function metersBetween(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const kx = 111_320 * Math.cos(((lat1 + lat2) / 2) * (Math.PI / 180));
  return Math.hypot((lat2 - lat1) * 110_540, (lng2 - lng1) * kx);
}

export function PlacesScreen({ toggleSearch }: { toggleSearch: () => void }) {
  const { entries } = useEntries();
  const [range, setRange] = useState<Range>('all');
  const [selected, setSelected] = useState<string | null>(null);
  const mapEl = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const me = useRef<L.CircleMarker | null>(null);
  const fitted = useRef('');

  const groups = useMemo<Group[]>(() => {
    const now = new Date();
    const y = String(now.getFullYear());
    const ym = `${y}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    // Repeat visits to the same place share ONE pin: same place name, or within ~300 m
    // (phone GPS drifts). Entries arrive newest first, so each pin sits where you were
    // most recently and shows the Photo of the Day from your latest visit.
    const out: Group[] = [];
    const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
    for (const e of entries) {
      if (!e.place) continue;
      if (range === 'year' && !e.date.startsWith(y)) continue;
      if (range === 'month' && !e.date.startsWith(ym)) continue;
      const { lat, lng, name } = e.place;
      const same = out.find((g) => norm(g.name) === norm(name) || metersBetween(g.lat, g.lng, lat, lng) < 300);
      if (same) same.entries.push(e);
      else out.push({ key: `${lat.toFixed(5)},${lng.toFixed(5)}`, name, lat, lng, entries: [e] });
    }
    return out;
  }, [entries, range]);

  // Create the map once.
  useEffect(() => {
    if (!mapEl.current || map.current) return;
    const m = L.map(mapEl.current, { zoomControl: false, attributionControl: true, worldCopyJump: true }).setView([20, 0], 2);
    L.tileLayer(TILE_URL, { maxZoom: 19, attribution: ATTRIBUTION }).addTo(m);
    L.control.zoom({ position: 'topright' }).addTo(m);
    m.attributionControl.setPrefix(false);
    m.on('click', () => setSelected(null));
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(mapEl.current);
    return () => {
      ro.disconnect();
      m.remove();
      map.current = null;
    };
  }, []);

  // Draw a photo pin for every place.
  useEffect(() => {
    let live = true;
    (async () => {
      const lg = layer.current;
      const m = map.current;
      if (!lg || !m) return;
      const thumbs = await Promise.all(groups.map((g) => {
        const cover = g.entries.map(coverOf).find(Boolean);
        return cover ? blobUrl(`${cover}:thumb`) : Promise.resolve(undefined);
      }));
      if (!live) return;
      lg.clearLayers();
      groups.forEach((g, i) => {
        const on = g.key === selected;
        const size = on ? 58 : 46;
        const photo = thumbs[i] ? `<img src="${thumbs[i]}" alt="" draggable="false">` : '';
        const count = g.entries.length > 1 ? `<span class="count">${g.entries.length}</span>` : '';
        const html = `<div class="pin${on ? ' selected' : ''}" style="width:${size}px;height:${size}px"><span class="pin-photo">${photo}</span>${count}</div>`;
        const icon = L.divIcon({ html, className: '', iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
        const marker = L.marker([g.lat, g.lng], { icon, title: `${g.name}, ${g.entries.length} ${g.entries.length === 1 ? 'entry' : 'entries'}`, keyboard: true, riseOnHover: true });
        marker.on('click', (ev) => {
          L.DomEvent.stopPropagation(ev);
          setSelected(g.key);
        });
        marker.addTo(lg);
      });
      const sig = groups.map((g) => g.key).join('|');
      if (groups.length && fitted.current !== sig) {
        fitted.current = sig;
        const bounds = L.latLngBounds(groups.map((g) => [g.lat, g.lng] as [number, number]));
        m.fitBounds(bounds, { padding: [64, 64], maxZoom: 15 });
      }
    })();
    return () => {
      live = false;
    };
  }, [groups, selected]);

  const active = groups.find((g) => g.key === selected) ?? null;

  const locate = async () => {
    try {
      const pos = await currentPosition();
      const ll: [number, number] = [pos.coords.latitude, pos.coords.longitude];
      const m = map.current;
      if (!m) return;
      me.current?.remove();
      me.current = L.circleMarker(ll, { radius: 8, color: '#fbf8f2', weight: 3, fillColor: '#9a5b3c', fillOpacity: 1 }).addTo(m);
      m.flyTo(ll, 15, { duration: 0.8 });
    } catch (err) {
      toast((err as Error).message);
    }
  };

  const photoCount = active ? active.entries.reduce((n, e) => n + e.photoIds.length, 0) : 0;

  return (
    <div className="places-page">
      <TopBar active="places" onSearch={toggleSearch} />
      <div className="map-area">
        <div ref={mapEl} className="map" role="region" aria-label="Map of Places You Wrote From" />
        <div className="map-controls" style={{ padding: '0 var(--gutter)' }}>
          <div className="row between" style={{ gap: 10 }}>
            <label className="pill">
              <span className="sr-only">Show Places From</span>
              <select value={range} onChange={(e) => (setRange(e.target.value as Range), setSelected(null))}>
                <option value="all">All Time</option>
                <option value="year">This Year</option>
                <option value="month">This Month</option>
              </select>
              <Icon name="chevDown" size={14} stroke={2} />
            </label>
            <button className="icon-btn" aria-label="Center on My Location" onClick={locate}>
              <Icon name="locate" size={20} stroke={1.9} />
            </button>
          </div>
        </div>

        {groups.length === 0 && (
          <div className="map-empty">
            <h2 className="h3">No Places Yet</h2>
            <p className="small" style={{ margin: '6px 0 0' }}>Add a location to an entry and it will show up here.</p>
          </div>
        )}

        {active && (
          <section className="sheet" aria-label={active.name}>
            <div className="handle" aria-hidden="true" />
            <div className="row between" style={{ gap: 12 }}>
              <div className="stack grow" style={{ gap: 2 }}>
                <h2 className="h3 ellipsis">{active.name}</h2>
                <span className="small">
                  {active.entries.length} {active.entries.length === 1 ? 'Entry' : 'Entries'} · {photoCount} {photoCount === 1 ? 'Photo' : 'Photos'}
                </span>
              </div>
              <a
                className="icon-btn outline"
                href={`https://www.openstreetmap.org/directions?to=${active.lat}%2C${active.lng}`}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Directions in OpenStreetMap"
              >
                <Icon name="directions" size={20} stroke={1.9} />
              </a>
              <button className="icon-btn outline" aria-label="Close" onClick={() => setSelected(null)}>
                <Icon name="x" size={18} stroke={2} />
              </button>
            </div>
            <div className="sheet-entries">
              {active.entries.slice(0, 6).map((e) => {
                const cover = coverOf(e);
                return (
                  <a key={e.date} href={`#/entry/${e.date}`} aria-label={`${e.title || 'Untitled Entry'}, ${shortDate(e.date)}`}>
                    <span className="ph">{cover ? <Photo id={cover} thumb /> : <Icon name="pen" size={18} />}</span>
                    <span className="tiny ellipsis" style={{ color: 'var(--ink)', fontWeight: 600 }}>
                      {mediumDate(e.date)}
                    </span>
                  </a>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
