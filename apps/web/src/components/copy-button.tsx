"use client";

import { useState } from "react";

export function CopyButton({
  value,
  label = "Copy",
  autoFocus = false,
  describedBy,
}: {
  value: string;
  label?: string;
  autoFocus?: boolean;
  /** id of text that explains why this is the next step (read by screen readers after the label). */
  describedBy?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      autoFocus={autoFocus}
      aria-describedby={describedBy}
      className="self-start rounded-md border print:hidden border-line bg-surface px-3 py-2 text-sm hover:border-foreground/40"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      <span aria-live="polite">{copied ? "Copied" : label}</span>
    </button>
  );
}
