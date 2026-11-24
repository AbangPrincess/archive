import { Icon } from './Icon';
import { Photo } from './Photo';
import { cardDate, duration, longDate } from '../lib/dates';
import { coverOf, totalDuration, type Entry } from '../lib/types';

/** Compact archive card: square photo, date, headline, and recording/place details. No diary text. */
export function EntryCard({ entry }: { entry: Entry }) {
  const cover = coverOf(entry);
  const dur = totalDuration(entry);
  const title = entry.title.trim() || 'Untitled Entry';
  const photos = entry.photoIds.length;
  return (
    <a className="entry-card" href={`#/entry/${entry.date}`} aria-label={`${title}, ${longDate(entry.date)}`}>
      <span className="thumb">{cover ? <Photo id={cover} thumb /> : <Icon name="pen" size={20} />}</span>
      <span className="card-body">
        <span className="card-top">
          <span className="card-date">{cardDate(entry.date)}</span>
          {entry.favorite && <Icon name="heartFill" size={16} style={{ color: 'var(--accent)' }} label="Favorite" />}
        </span>
        <span className="card-title ellipsis">{title}</span>
        <span className="card-meta">
          {dur > 0 && (
            <span>
              <Icon name="mic" size={13} stroke={2} />
              {duration(dur)}
            </span>
          )}
          {entry.place && (
            <span className="place">
              <Icon name="pin" size={13} stroke={2} />
              <span className="ellipsis">{entry.place.name}</span>
            </span>
          )}
          {!dur && !entry.place && (
            <span>
              <Icon name={photos ? 'image' : 'pen'} size={13} stroke={2} />
              {photos ? `${photos} ${photos === 1 ? 'Photo' : 'Photos'}` : 'Written Entry'}
            </span>
          )}
        </span>
      </span>
    </a>
  );
}
