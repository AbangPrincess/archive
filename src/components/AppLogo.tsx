/** The Archive app mark — the same artwork as the app icon and browser tab icon. */
export function AppLogo({ size = 72, title }: { size?: number; title?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      style={{ flex: 'none', display: 'block' }}
    >
      <rect width="512" height="512" rx="112" fill="#fbf8f2" />
      <rect x="120" y="136" width="272" height="252" rx="40" fill="none" stroke="#2A2420" strokeWidth="28" />
      <path d="M120 212h272M196 104v64M316 104v64" stroke="#2A2420" strokeWidth="28" strokeLinecap="round" />
      <circle cx="256" cy="300" r="34" fill="#9A5B3C" />
    </svg>
  );
}
