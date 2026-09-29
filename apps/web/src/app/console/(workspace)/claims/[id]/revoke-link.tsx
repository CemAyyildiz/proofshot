"use client";

import { ConfirmAction } from "@/components/confirm-action";
import { revokeLink } from "../../actions";

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
