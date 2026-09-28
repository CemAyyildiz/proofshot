import type { Metadata } from "next";
import { Verifier } from "./verifier";

export const metadata: Metadata = {
  title: "Verify a photo · Proofshot",
  description: "Check whether a photo was sealed with Proofshot, whether it was altered, and when it was sealed. No account needed.",
};

export default function VerifyPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-10">
      <header className="flex flex-col gap-2">
        <p className="eyebrow">Public Verifier</p>
        <h1 className="text-3xl font-semibold">Verify a photo</h1>
        <p className="text-muted">
          Drop in any copy of a claim photo, even one forwarded over a messaging app. You&apos;ll see whether it was
          sealed, when, and whether anything was changed. No account needed, and your image is not kept.
        </p>
      </header>
      <Verifier />
    </main>
  );
}
