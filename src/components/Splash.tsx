import { useEffect, useState } from 'react';
import { Wordmark } from './TopBar';

export const SPLASH_MS = 2000;

/** Opening splash: the same "My Journal / Archive" wordmark as the header, fading in and out within two seconds. */
export function Splash() {
  const [show, setShow] = useState(true);
  useEffect(() => {
    const t = window.setTimeout(() => setShow(false), SPLASH_MS);
    return () => window.clearTimeout(t);
  }, []);
  if (!show) return null;
  return (
    <div className="splash" role="status" aria-label="Opening Archive">
      <div className="splash-mark">
        <Wordmark />
      </div>
    </div>
  );
}
