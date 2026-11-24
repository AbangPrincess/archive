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
import { go, rememberTab, useRoute } from './lib/router';
import { hasPin } from './lib/pin';
import { getSettings } from './lib/settings';
import { loadEntries } from './lib/store';
import { isValidKey, todayKey } from './lib/dates';

type Gate = 'setup' | 'locked' | 'open';
const TABS = ['all', 'favorites', 'calendar', 'places'];

export function App() {
  const [gate, setGate] = useState<Gate>(() => (hasPin() ? 'locked' : 'setup'));
  const [everOpen, setEverOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const hiddenAt = useRef(0);
  const { parts, query: qs } = useRoute();

  useEffect(() => {
    loadEntries();
  }, []);

  // Ask for the PIN again after the app has been away for the chosen time.
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt.current = Date.now();
        if (getSettings().autoLock === 0) setGate((g) => (g === 'open' ? 'locked' : g));
      } else if (hiddenAt.current) {
        const away = Date.now() - hiddenAt.current;
        if (away >= getSettings().autoLock * 60_000) setGate((g) => (g === 'open' ? 'locked' : g));
        hiddenAt.current = 0;
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  const unlock = useCallback(() => {
    setGate('open');
    setEverOpen(true);
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
    screen = <SettingsScreen onLockNow={() => setGate('locked')} />;
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
    </>
  );
}
