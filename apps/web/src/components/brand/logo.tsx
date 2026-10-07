/** Proofshot mark: a viewfinder closing on a check, on Monad purple. Decorative next to the wordmark. */
export function LogoMark({ className = "size-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none">
      <rect x="1" y="1" width="22" height="22" rx="7" fill="var(--brand)" />
      <g stroke="var(--brand-fg)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5.6 9V7.2a1.6 1.6 0 0 1 1.6-1.6H9M15 5.6h1.8a1.6 1.6 0 0 1 1.6 1.6V9M18.4 15v1.8a1.6 1.6 0 0 1-1.6 1.6H15M9 18.4H7.2a1.6 1.6 0 0 1-1.6-1.6V15" />
        <path d="M9.2 12.2l2 2 3.7-4" strokeWidth="2" />
      </g>
    </svg>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`display inline-flex items-center gap-2 text-xl text-foreground ${className}`}>
      <LogoMark />
      Proofshot
    </span>
  );
}
