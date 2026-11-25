import { useCallback, useEffect, useRef, useState } from 'react';
import { LockScreen } from './components/LockScreen';
import { ToastHost } from './components/Toast';
import { AllScreen } from './screens/AllScreen';
import { FavoritesScreen } from './screens/FavoritesScreen';
import { CalendarScreen } from './screens/CalendarScreen';
import { PlacesScreen } from './screens/PlacesScreen';
import { EntryScreen } from './screens/EntryScreen';
import { DictateScreen } from './screens/DictateScreen';
import { ListenScreen } from './screens/ListenScreen';
import { CameraScreen } from './screens/CameraScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { Splash } from './components/Splash';
import { go, rememberTab, useRoute } from './lib/router';
import { hasPin } from './lib/pin';
import { getSettings } from './lib/settings';
import { loadEntries } from './lib/store';
import { isValidKey, todayKey } from './lib/dates';
import { markAway, markLeavingPage, markLocked, markUnlocked, stillUnlocked, touch } from './lib/session';

type Gate = 'setup' | 'locked' | 'open';
const TABS = ['all', 'favorites', 'calendar', 'places'];

function initialGate(): Gate {
  if (!hasPin()) return 'setup';
  return stillUnlocked(getSettings().autoLock) ? 'open' : 'locked';
}

export function App() {
  const [gate, setGate] = useState<Gate>(initialGate);
  const [everOpen, setEverOpen] = useState(() => gate === 'open');
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const hiddenAt = useRef(0);
  const { parts, query: qs } = useRoute();

  useEffect(() => {
    loadEntries();
  }, []);

  // Auto-Lock: ask for the PIN again only after the app has been away for the chosen time.
  // A page refresh is not "away", so it keeps you where you were.
  useEffect(() => {
    const onVis = () => {
      const limit = getSettings().autoLock * 60_000;
      if (document.visibilityState === 'hidden') {
        hiddenAt.current = Date.now();
        markAway();
        if (limit === 0) setGate((g) => (g === 'open' ? 'locked' : g)); // hide the journal straight away
      } else {
        const away = hiddenAt.current ? Date.now() - hiddenAt.current : 0;
        hiddenAt.current = 0;
        if (limit === 0 || away >= limit) {
          setGate((g) => {
            if (g === 'open' || g === 'locked') {
              markLocked();
              return 'locked';
            }
            return g;
          });
        } else {
          touch();
        }
      }
    };
    const onLeave = () => markLeavingPage();
    const beat = window.setInterval(() => document.visibilityState === 'visible' && touch(), 15_000);
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', onLeave);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', onLeave);
      window.clearInterval(beat);
    };
  }, []);

  const unlock = useCallback(() => {
    markUnlocked();
    setGate('open');
    setEverOpen(true);
  }, []);

  const lockNow = useCallback(() => {
    markLocked();
    setGate('locked');
  }, []);

  const [section, date, tool] = parts;
  const isTab = !section || TABS.includes(section);
  const tab = section && TABS.includes(section) ? section : 'all';

  useEffect(() => {
    if (isTab) rememberTab(`/${tab}`);
  }, [isTab, tab]);

  // Keep dates sane: no unknown routes, no future days.
  useEffect(() => {
    if (section === 'entry' && (!isValidKey(date) || date > todayKey())) go('/all', true);
    else if (section && !TABS.includes(section) && section !== 'entry' && section !== 'settings') go('/all', true);
  }, [section, date]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [section, date, tool]);

  const toggleSearch = () => {
    if (tab !== 'all' || !isTab) {
      setSearchOpen(true);
      go('/all');
    } else {
      setSearchOpen((v) => !v);
      setQuery('');
    }
  };

  let screen: React.ReactNode = null;
  if (section === 'entry' && isValidKey(date) && date <= todayKey()) {
    if (tool === 'speak') screen = <DictateScreen key={date} date={date} />;
    else if (tool === 'listen') screen = <ListenScreen key={`${date}-${qs.get('r')}`} date={date} recId={qs.get('r')} />;
    else if (tool === 'camera') screen = <CameraScreen key={date} date={date} />;
    else screen = <EntryScreen key={date} date={date} focusBody={qs.get('focus') === 'body'} />;
  } else if (section === 'settings') {
    screen = <SettingsScreen onLockNow={lockNow} />;
  } else if (tab === 'favorites') {
    screen = <FavoritesScreen toggleSearch={toggleSearch} />;
  } else if (tab === 'calendar') {
    screen = <CalendarScreen toggleSearch={toggleSearch} />;
  } else if (tab === 'places') {
    screen = <PlacesScreen toggleSearch={toggleSearch} />;
  } else {
    screen = <AllScreen searchOpen={searchOpen} query={query} setQuery={setQuery} toggleSearch={toggleSearch} />;
  }

  const showApp = everOpen || gate === 'open';
  return (
    <>
      {showApp && (
        <div inert={gate !== 'open' ? true : undefined} aria-hidden={gate !== 'open' ? true : undefined} style={gate !== 'open' ? { visibility: 'hidden' } : undefined}>
          {screen}
        </div>
      )}
      {gate === 'setup' && <LockScreen mode="setup" onDone={unlock} />}
      {gate === 'locked' && <LockScreen mode="unlock" onDone={unlock} />}
      <ToastHost />
      <Splash />
    </>
  );
}
