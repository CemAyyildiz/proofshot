"use client";

import { useSyncExternalStore } from "react";
import { SendIcon } from "./icons";

/**
 * Opens the phone's own share sheet (SMS, WhatsApp, email) with a link. Rendered only where the browser supports it;
 * the server snapshot says "no", so the server and the first client render agree.
 */
const noSubscription = () => () => {};
const canShare = () => typeof navigator.share === "function";
export function ShareButton({ url, title, label = "Share" }: { url: string; title: string; label?: string }) {
  const supported = useSyncExternalStore(noSubscription, canShare, () => false);
  if (!supported) return null;
  return (
    <button
      type="button"
      className="btn-secondary text-sm print:hidden"
      onClick={() => navigator.share({ title, url }).catch(() => undefined /* the person closed the sheet */)}
    >
      <SendIcon className="size-4" />
      {label}
    </button>
  );
}
