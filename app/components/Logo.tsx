export function LogoMark({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      {/* Crystal orb — prophecy / foresight */}
      <circle cx="12" cy="11" r="8" stroke="currentColor" strokeWidth="1.5" opacity="0.35" />
      {/* Upward trend line — capital / growth */}
      <polyline
        points="5,14 8,11 11,13 15,7 19,10"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Vision peak — the prophecy moment */}
      <circle cx="15" cy="7" r="2" fill="currentColor" />
    </svg>
  );
}
