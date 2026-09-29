/** Small stroke icons (24px grid). Decorative: pair every icon with visible text. */
type P = { className?: string };
const base = (className = "size-4") => ({
  className,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
});

export const WarningIcon = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M12 3l9.5 17h-19z" />
    <path d="M12 10v4M12 17.5v.5" />
  </svg>
);
export const CheckIcon = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M5 12.5l4.5 4.5L19 7" />
  </svg>
);
export const CameraIcon = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
    <circle cx="12" cy="13" r="3.5" />
  </svg>
);
export const LockIcon = ({ className }: P) => (
  <svg {...base(className)}>
    <rect x="5" y="11" width="14" height="9" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </svg>
);
export const ArrowLeftIcon = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M19 12H5m6-6l-6 6 6 6" />
  </svg>
);
