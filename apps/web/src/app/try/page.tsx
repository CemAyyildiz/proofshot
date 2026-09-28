import type { Metadata } from "next";
import { StartDemoButton } from "./start-demo-button";

export const metadata: Metadata = { title: "Try Proofshot" };

/** Where the landing page's QR code points: one tap from a desktop visitor's phone into the demo. */
export default function TryPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-5 px-4 py-12">
      <p className="eyebrow">Proofshot demo</p>
      <h1 className="text-2xl font-semibold">Seal a photo on this phone</h1>
      <p className="text-muted">
        You&apos;ll take a photo that is sealed the moment you take it, then try to fool the verifier with an edited
        copy. Nothing to install and no sign-up.
      </p>
      <StartDemoButton label="Start the demo" />
    </main>
  );
}
