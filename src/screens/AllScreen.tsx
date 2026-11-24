import { useMemo } from 'react';
import { TopBar, WriteDock } from '../components/TopBar';
import { EntryCard } from '../components/EntryCard';
import { Icon } from '../components/Icon';
import { useEntries } from '../lib/store';
import { monthTitle, todayKey } from '../lib/dates';
import type { Entry } from '../lib/types';

type Props = { searchOpen: boolean; query: string; setQuery: (q: string) => void; toggleSearch: () => void };

export function AllScreen({ searchOpen, query, setQuery, toggleSearch }: Props) {
  const { entries, loaded } = useEntries();
  const q = query.trim().toLowerCase();
  const list = useMemo(
    () =>
      q
        ? entries.filter((e) => [e.title, e.body, e.place?.name ?? ''].some((s) => s.toLowerCase().includes(q)))
        : entries,
    [entries, q],
  );
  const groups = useMemo(() => {
    const map = new Map<string, Entry[]>();
    for (const e of list) {
      const k = e.date.slice(0, 7);
      map.set(k, [...(map.get(k) ?? []), e]);
    }
    return [...map.entries()];
  }, [list]);
  const today = todayKey();

  return (
    <div className="page">
      <TopBar active="all" onSearch={toggleSearch} searchOpen={searchOpen} />
      <main className="wrap">
        {searchOpen && (
          <div className="search-row">
            <label className="search-field">
              <Icon name="search" size={18} style={{ color: 'var(--muted)' }} />
              <span className="sr-only">Search Entries</span>
              <input autoFocus type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search Titles, Words or Places" />
              {query && (
                <button className="icon-btn" style={{ width: 36, height: 36 }} aria-label="Clear Search" onClick={() => setQuery('')}>
                  <Icon name="x" size={16} stroke={2} />
                </button>
              )}
            </label>
          </div>
        )}

        {loaded && entries.length === 0 && (
          <div className="empty">
            <Icon name="pen" size={28} />
            <h2 className="h3">Your Archive Is Empty</h2>
            <p style={{ margin: 0, maxWidth: 360 }}>Write or speak about today, add a few photos, and your days will start to collect here.</p>
          </div>
        )}
        {loaded && entries.length > 0 && list.length === 0 && (
          <div className="empty">
            <Icon name="search" size={28} />
            <h2 className="h3">No Matches</h2>
            <p style={{ margin: 0 }}>Nothing in your journal matches “{query.trim()}”.</p>
          </div>
        )}

        {groups.map(([month, items]) => {
          const [y, m] = month.split('-').map(Number);
          return (
            <section key={month} className="month-block" aria-label={monthTitle(y, m - 1)}>
              <div className="section-head">
                <h2 className="h2">{monthTitle(y, m - 1)}</h2>
                <span className="tiny">
                  {items.length} {items.length === 1 ? 'Entry' : 'Entries'}
                </span>
              </div>
              <ul className="card-grid">
                {items.map((e) => (
                  <li key={e.date}>
                    <EntryCard entry={e} />
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </main>
      <WriteDock today={today} />
    </div>
  );
}
