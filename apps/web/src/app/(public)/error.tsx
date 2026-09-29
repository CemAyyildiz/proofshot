"use client";

import { useEffect } from "react";

/** Honest fallback: if the registry or database is unreachable, say so instead of showing a guessed Verdict. */
export default function PublicError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => console.error(error), [error]);
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4 px-4 py-16">
      <h1 className="text-2xl font-semibold">We can&apos;t show this right now</h1>
      <p className="text-muted">
        The public registry or our servers didn&apos;t respond, so we can&apos;t give a Verdict or receipt that we can stand behind.
        Nothing is wrong with your photo. Try again in a minute.
      </p>
      <button type="button" onClick={retry} className="btn-primary self-start">
        Try again
      </button>
    </main>
  );
}
