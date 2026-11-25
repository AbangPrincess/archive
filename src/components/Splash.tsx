import { useEffect, useState } from 'react';
import { AppLogo } from './AppLogo';

export const SPLASH_MS = 2000;

/** Opening splash: the app mark fades in, holds, and fades out within two seconds. */
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
        <AppLogo size={88} />
        <span className="splash-name">Archive</span>
      </div>
    </div>
  );
}
