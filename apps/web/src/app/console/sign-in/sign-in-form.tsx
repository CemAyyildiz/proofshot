"use client";

import { useActionState } from "react";
import { requestSignIn, type SignInState } from "@/app/auth/actions";

export function SignInForm() {
  const [state, action, pending] = useActionState<SignInState, FormData>(requestSignIn, { status: "idle" });

  if (state.status === "sent") {
    return (
      <p role="status" className="rounded-md border border-line bg-surface p-4">
        If that address belongs to a Carrier workspace, a sign-in link is on its way. It works once and expires in 15
        minutes.
      </p>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-3">
      <label htmlFor="email" className="text-sm font-medium">
        Work email
      </label>
      <input
        id="email"
        name="email"
        type="email"
        autoComplete="email"
        required
        className="rounded-md border border-line bg-surface px-3 py-2"
        aria-invalid={state.status === "invalid"}
        aria-describedby={state.status === "invalid" ? "email-error" : undefined}
      />
      {state.status === "invalid" && (
        <p id="email-error" className="text-sm text-danger">
          Enter a valid email address.
        </p>
      )}
      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? "Sending…" : "Email me a sign-in link"}
      </button>
    </form>
  );
}
