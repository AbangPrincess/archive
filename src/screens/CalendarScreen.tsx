import { useMemo } from 'react';
import { TopBar, WriteDock } from '../components/TopBar';
import { Photo } from '../components/Photo';
import { useEntries } from '../lib/store';
import { longDate, monthTitle, todayKey, toKey, weekdayInitials } from '../lib/dates';
import { coverOf, type Entry } from '../lib/types';

export function CalendarScreen({ toggleSearch }: { toggleSearch: () => void }) {
  const { entries } = useEntries();
  const today = todayKey();
  const byDate = useMemo(() => new Map(entries.map((e) => [e.date, e])), [entries]);

  const months = useMemo(() => {
    // Newest month first, back to the month of the oldest entry (always at least two months).
    const now = new Date();
    const start = now.getFullYear() * 12 + now.getMonth();
    const oldest = entries.length ? entries[entries.length - 1].date : '';
    const oldestIndex = oldest ? Number(oldest.slice(0, 4)) * 12 + Number(oldest.slice(5, 7)) - 1 : start;
    const end = Math.min(oldestIndex, start - 1);
    const list: { y: number; m: number }[] = [];
    for (let i = start; i >= end; i--) list.push({ y: Math.floor(i / 12), m: i % 12 });
    return list;
  }, [entries]);

  const initials = weekdayInitials();

  return (
    <div className="page">
      <TopBar active="calendar" onSearch={toggleSearch} />
      <main className="wrap">
        <div className="months">
          {months.map(({ y, m }) => {
            const first = new Date(y, m, 1).getDay();
            const days = new Date(y, m + 1, 0).getDate();
            const count = entries.filter((e) => e.date.startsWith(`${y}-${String(m + 1).padStart(2, '0')}`)).length;
            return (
              <section key={`${y}-${m}`} aria-label={monthTitle(y, m)}>
                <div className="section-head">
                  <h2 className="h2">{monthTitle(y, m)}</h2>
                  <span className="tiny">
                    {count} {count === 1 ? 'Entry' : 'Entries'}
                  </span>
                </div>
                <div className="cal-week labels" aria-hidden="true">
                  {initials.map((d, i) => (
                    <span key={i}>{d}</span>
                  ))}
                </div>
                <div className="cal-grid">
                  {Array.from({ length: first }, (_, i) => (
                    <span key={`b${i}`} className="cal-cell" aria-hidden="true" />
                  ))}
                  {Array.from({ length: days }, (_, i) => {
                    const key = toKey(new Date(y, m, i + 1));
                    return (
                      <span key={key} className="cal-cell">
                        <Day dateKey={key} n={i + 1} entry={byDate.get(key)} today={today} />
                      </span>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </main>
      <WriteDock today={today} />
    </div>
  );
}

function Day({ dateKey, n, entry, today }: { dateKey: string; n: number; entry?: Entry; today: string }) {
  if (dateKey > today) {
    return (
      <span className="day future" aria-label={`${longDate(dateKey)}, upcoming`}>
        {n}
      </span>
    );
  }
  const cover = entry ? coverOf(entry) : undefined;
  const cls = ['day', entry ? 'has-entry' : '', cover ? 'has-photo' : '', dateKey === today ? 'today' : ''].filter(Boolean).join(' ');
  const label = `${longDate(dateKey)}${entry ? `, ${entry.title.trim() || 'Untitled Entry'}` : dateKey === today ? ', today, start an entry' : ', no entry'}`;
  return (
    <a className={cls} href={`#/entry/${dateKey}`} aria-label={label}>
      {cover && <Photo id={cover} thumb />}
      <span>{n}</span>
    </a>
  );
}
