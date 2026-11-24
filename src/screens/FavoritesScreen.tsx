import { TopBar, WriteDock } from '../components/TopBar';
import { Icon } from '../components/Icon';
import { Photo } from '../components/Photo';
import { useEntries } from '../lib/store';
import { longDate, shortDate, todayKey } from '../lib/dates';
import { coverOf } from '../lib/types';

export function FavoritesScreen({ toggleSearch }: { toggleSearch: () => void }) {
  const { entries, loaded } = useEntries();
  const favs = entries.filter((e) => e.favorite);

  return (
    <div className="page">
      <TopBar active="favorites" onSearch={toggleSearch} />
      <main className="wrap">
        <div className="section-head">
          <h2 className="h2">Days You Loved</h2>
          {favs.length > 0 && (
            <span className="tiny">
              {favs.length} {favs.length === 1 ? 'Favorite' : 'Favorites'}
            </span>
          )}
        </div>
        {loaded && favs.length === 0 ? (
          <div className="empty">
            <Icon name="heart" size={28} />
            <h2 className="h3">No Favorites Yet</h2>
            <p style={{ margin: 0, maxWidth: 360 }}>Tap the heart on any entry to keep that day here.</p>
          </div>
        ) : (
          <ul className="fav-grid">
            {favs.map((e) => {
              const cover = coverOf(e);
              const title = e.title.trim() || 'Untitled Entry';
              return (
                <li key={e.date}>
                  <a className={`fav-card${cover ? '' : ' no-photo'}`} href={`#/entry/${e.date}`} aria-label={`${title}, ${longDate(e.date)}`}>
                    {cover && <Photo id={cover} thumb />}
                    <span className="badge">
                      <Icon name="heartFill" size={15} />
                    </span>
                    <span className="caption">
                      <span className="card-date">{shortDate(e.date)}</span>
                      <strong>{title}</strong>
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        )}
      </main>
      <WriteDock today={todayKey()} />
    </div>
  );
}
