"use client";

import { useActionState } from "react";
import { startDemo } from "./actions";

export function StartDemoButton({ label = "Try it on this phone" }: { label?: string }) {
  const [state, action, pending] = useActionState(async () => startDemo(), null);
  return (
    <form action={action} className="flex flex-col gap-2">
      <button type="submit" disabled={pending} className="btn-primary py-3 text-lg">
        {pending ? "Starting…" : label}
      </button>
      {state?.error && (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}
    </form>
  );
}
