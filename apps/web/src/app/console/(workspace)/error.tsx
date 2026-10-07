"use client";

import { useEffect } from "react";

export default function ConsoleError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => console.error(error), [error]);
  return (
    <div className="flex max-w-md flex-col gap-4">
      <h1 className="display text-3xl sm:text-4xl">Something didn&apos;t load</h1>
      <p className="text-muted">The Console couldn&apos;t reach the registry or the database. Your Claim Files are safe; try again in a minute.</p>
      <button type="button" onClick={retry} className="btn-primary self-start">
        Try again
      </button>
    </div>
  );
}
