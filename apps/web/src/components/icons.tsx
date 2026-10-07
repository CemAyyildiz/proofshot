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
export const MinusIcon = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M6 12h12" />
  </svg>
);
export const ShieldCheckIcon = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.2-7.5 9.5-4.3-1.3-7.5-4.9-7.5-9.5V6z" />
    <path d="M8.8 12.2l2.3 2.3 4.2-4.4" />
  </svg>
);
export const CodeIcon = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M9 7l-5 5 5 5M15 7l5 5-5 5" />
  </svg>
);
export const FingerprintIcon = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M7.5 18.5c1.2-1.8 1.8-4 1.8-6.5a2.7 2.7 0 0 1 5.4 0c0 1.2-.1 2.4-.3 3.5" />
    <path d="M4.8 15.5c.5-1.1.7-2.3.7-3.5a6.5 6.5 0 0 1 11.6-4" />
    <path d="M12 12c0 3.5-.9 6.5-2.6 9M18.3 11c.1.3.1.7.1 1 0 2.9-.6 5.6-1.6 8" />
  </svg>
);
export const CopiesIcon = ({ className }: P) => (
  <svg {...base(className)}>
    <rect x="8" y="8" width="12" height="12" rx="2" />
    <path d="M4 16V6a2 2 0 0 1 2-2h10" />
  </svg>
);
export const SendIcon = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M4 12l16-8-6 16-2.5-6.5z" />
    <path d="M11.5 13.5L20 4" />
  </svg>
);
export const ArrowRightIcon = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M5 12h14m-6-6l6 6-6 6" />
  </svg>
);
export const ShareIcon = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M12 15V3m0 0L8 7m4-4l4 4" />
    <path d="M5 11v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8" />
  </svg>
);
export const UploadIcon = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M12 16V4m0 0L8 8m4-4l4 4" />
    <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
  </svg>
);
