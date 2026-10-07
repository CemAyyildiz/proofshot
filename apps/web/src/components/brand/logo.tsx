/** Proofshot mark: a camera aperture closed by a seal check, on the evidence-marker yellow. Decorative. */
export function LogoMark({ className = "size-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none">
      <rect x="1" y="1" width="22" height="22" rx="6" fill="var(--brand)" />
      <circle cx="12" cy="12" r="5.75" stroke="var(--brand-fg)" strokeWidth="2" />
      <path d="M9.4 12.2l1.8 1.8 3.5-3.7" stroke="var(--brand-fg)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`display inline-flex items-center gap-2 text-lg text-foreground ${className}`}>
      <LogoMark />
      Proofshot
    </span>
  );
}
