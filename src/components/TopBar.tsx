import { Icon, type IconName } from './Icon';

export type TabKey = 'all' | 'favorites' | 'calendar' | 'places';

const TABS: { key: TabKey; label: string; icon: IconName; activeIcon?: IconName }[] = [
  { key: 'all', label: 'All', icon: 'list' },
  { key: 'favorites', label: 'Favorites', icon: 'heart', activeIcon: 'heartFill' },
  { key: 'calendar', label: 'Calendar', icon: 'calendar' },
  { key: 'places', label: 'Places', icon: 'pin' },
];

type Props = { active: TabKey; onSearch?: () => void; searchOpen?: boolean };

/**
 * The "My Journal / Archive" wordmark. The header, splash screen and PIN screen
 * all use this one component so the text, font, size and spacing always match.
 */
export function Wordmark({ heading = false, center = false }: { heading?: boolean; center?: boolean }) {
  const Title = heading ? 'h1' : 'span';
  return (
    <div className={`wordmark${center ? ' center' : ''}`}>
      <span className="eyebrow">My Journal</span>
      <Title className="brand">Archive</Title>
    </div>
  );
}

/** "My Journal / Archive" header with search, the menu, and the four archive tabs. */
export function TopBar({ active, onSearch, searchOpen }: Props) {
  return (
    <div className="topbar">
      <div className="wrap">
        <header className="app-header">
          <Wordmark heading />
          <div className="actions">
            <button className="icon-btn" aria-label={searchOpen ? 'Close Search' : 'Search Entries'} aria-pressed={searchOpen} onClick={onSearch}>
              <Icon name={searchOpen ? 'x' : 'search'} />
            </button>
            <a className="icon-btn" href="#/settings" aria-label="Menu and Settings">
              <Icon name="menu" />
            </a>
          </div>
        </header>
        <nav className="tabs" aria-label="Archive Views">
          {TABS.map((t) => {
            const on = t.key === active;
            return (
              <a key={t.key} className="tab" href={`#/${t.key}`} aria-current={on ? 'page' : undefined}>
                <Icon name={on && t.activeIcon ? t.activeIcon : t.icon} size={22} stroke={1.7} />
                <span>{t.label}</span>
              </a>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

/** Fixed "Write Today" + microphone actions shown on the archive tabs. */
export function WriteDock({ today }: { today: string }) {
  return (
    <div className="dock">
      <div className="dock-inner">
        <a className="write-btn" href={`#/entry/${today}`}>
          <Icon name="pen" size={20} />
          Write Today
        </a>
        <a className="mic-btn" href={`#/entry/${today}/speak?auto=1`} aria-label="Start Recording Today’s Entry">
          <Icon name="mic" size={24} stroke={1.9} />
        </a>
      </div>
    </div>
  );
}
