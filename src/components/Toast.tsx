import { useEffect, useState } from 'react';

let push: ((msg: string) => void) | null = null;

export function toast(msg: string) {
  push?.(msg);
}

export function ToastHost() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    let timer = 0;
    push = (m) => {
      setMsg(m);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setMsg(null), 3200);
    };
    return () => {
      push = null;
      window.clearTimeout(timer);
    };
  }, []);
  if (!msg) return null;
  return (
    <div className="toast" role="status" aria-live="polite">
      {msg}
    </div>
  );
}
