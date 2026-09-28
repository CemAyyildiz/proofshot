"use client";

import { useActionState } from "react";
import { createClaim, type CreateClaimState } from "./actions";

export function CreateClaimForm() {
  const [state, action, pending] = useActionState<CreateClaimState, FormData>(createClaim, {});
  return (
    <form action={action} className="flex flex-col gap-2 sm:flex-row sm:items-start">
      <div className="flex flex-1 flex-col gap-1">
        <label htmlFor="reference" className="sr-only">
          Claim reference
        </label>
        <input
          id="reference"
          name="reference"
          placeholder="Claim reference, e.g. AUTO-2026-0042"
          maxLength={80}
          required
          className="rounded-md border border-line bg-surface px-3 py-2"
          aria-invalid={Boolean(state.error)}
          aria-describedby={state.error ? "reference-error" : undefined}
        />
        {state.error && (
          <p id="reference-error" className="text-sm text-danger">
            {state.error}
          </p>
        )}
      </div>
      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? "Creating…" : "Create Claim File"}
      </button>
    </form>
  );
}
