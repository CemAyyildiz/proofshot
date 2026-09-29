"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Two-step, inline confirmation for irreversible actions: the first press explains the consequence and moves focus
 * to "Cancel" (the safe default); only the second, explicit button acts.
 */
export function ConfirmAction({
  trigger,
  question,
  confirmLabel,
  onConfirm,
  tone = "danger",
  triggerClassName = "",
}: {
  trigger: string;
  question: string;
  confirmLabel: string;
  onConfirm: () => void | Promise<void>;
  tone?: "danger" | "neutral";
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (open) cancelRef.current?.focus();
  }, [open]);

  if (!open) {
    return (
      <button type="button" className={triggerClassName} onClick={() => setOpen(true)}>
        {trigger}
      </button>
    );
  }
  return (
    <div role="group" aria-label={question} className="flex flex-wrap items-center gap-2 self-start text-sm">
      <span>{question}</span>
      <button
        type="button"
        disabled={busy}
        className={`rounded-md px-3 py-1.5 font-medium ${tone === "danger" ? "bg-danger text-surface" : "bg-accent text-accent-fg"} disabled:opacity-50`}
        onClick={async () => {
          setBusy(true);
          try {
            await onConfirm();
          } finally {
            setBusy(false);
            setOpen(false);
          }
        }}
      >
        {confirmLabel}
      </button>
      <button ref={cancelRef} type="button" className="rounded-md border border-line px-3 py-1.5" onClick={() => setOpen(false)}>
        Cancel
      </button>
    </div>
  );
}
