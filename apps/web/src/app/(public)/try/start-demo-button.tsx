"use client";

import { useActionState } from "react";
import { ArrowRightIcon } from "@/components/icons";
import { startDemo } from "./actions";

export function StartDemoButton({ label = "Try it on this phone" }: { label?: string }) {
  const [state, action, pending] = useActionState(async () => startDemo(), null);
  return (
    <form action={action} className="flex flex-col gap-2">
      <button type="submit" disabled={pending} className="btn-primary min-h-14 text-lg">
        {pending ? "Starting…" : label}
        {!pending && <ArrowRightIcon className="size-5" />}
      </button>
      {state?.error && (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}
    </form>
  );
}
