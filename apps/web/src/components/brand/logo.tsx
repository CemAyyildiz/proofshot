/** Proofshot mark: a camera aperture closed by a seal check. Decorative next to the wordmark. */
export function LogoMark({ className = "size-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none">
      <rect x="1.5" y="1.5" width="21" height="21" rx="6" fill="currentColor" />
      <circle cx="12" cy="12" r="5.75" stroke="var(--background)" strokeWidth="1.75" />
      <path d="M9.4 12.2l1.8 1.8 3.5-3.7" stroke="var(--background)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-semibold tracking-tight text-foreground ${className}`}>
      <LogoMark />
      Proofshot
    </span>
  );
}
