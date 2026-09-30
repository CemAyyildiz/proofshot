"use client";

import { ConfirmAction } from "@/components/confirm-action";
import { replaceLink, revokeLink } from "../../actions";

export function RevokeLink({ claimFileId }: { claimFileId: string }) {
  return (
    <ConfirmAction
      trigger="Revoke link"
      triggerClassName="self-start text-sm text-danger underline underline-offset-4"
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
export function ReplaceLink({ claimFileId, active }: { claimFileId: string; active: boolean }) {
  return (
    <ConfirmAction
      trigger={active ? "Replace link" : "Issue a new link"}
      triggerClassName="self-start text-sm underline underline-offset-4"
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
