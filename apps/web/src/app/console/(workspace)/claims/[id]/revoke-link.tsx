"use client";

import { ConfirmAction } from "@/components/confirm-action";
import { replaceLink, revokeLink } from "../../actions";

/** 24 px+ tall (WCAG 2.2 target size) while still reading as quiet text links next to the primary Copy button. */
const LINK_ACTION = "self-start py-1 text-sm underline underline-offset-4";

export function RevokeLink({ claimFileId }: { claimFileId: string }) {
  return (
    <ConfirmAction
      trigger="Revoke link"
      triggerClassName={`${LINK_ACTION} text-danger`}
      question="Revoke this link? The policyholder won't be able to add photos, and this can't be undone."
      confirmLabel="Revoke link"
      onConfirm={async () => {
        const form = new FormData();
        form.set("claimFileId", claimFileId);
        await revokeLink(form);
      }}
    />
  );
}

/** Retires the current link and issues a fresh one for the same Claim File (e.g. a link sent to the wrong person). */
export function ReplaceLink({ claimFileId, active, autoFocus = false }: { claimFileId: string; active: boolean; autoFocus?: boolean }) {
  return (
    <ConfirmAction
      trigger={active ? "Replace link" : "Issue a new link"}
      triggerClassName={LINK_ACTION}
      autoFocus={autoFocus}
      // Replacing cuts off a link someone may be using; issuing one after a revoke or expiry takes nothing away.
      tone={active ? "danger" : "neutral"}
      question={
        active
          ? "Replace this link? The current link stops accepting photos at once; photos already sealed with it can still be sent. You'll get a new link to send."
          : "Issue a new link for this Claim File? It is valid for 14 days; photos already in the file stay."
      }
      confirmLabel={active ? "Replace link" : "Issue new link"}
      onConfirm={async () => {
        const form = new FormData();
        form.set("claimFileId", claimFileId);
        await replaceLink(form);
      }}
    />
  );
}
