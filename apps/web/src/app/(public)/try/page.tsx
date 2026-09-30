import type { Metadata } from "next";
import { CameraIcon, CopiesIcon, LockIcon } from "@/components/icons";
import { StartDemoButton } from "./start-demo-button";

export const metadata: Metadata = { title: "Try Proofshot" };

const STEPS = [
  { icon: LockIcon, text: "Confirm with Face ID, your fingerprint or your phone's PIN. Nothing to install." },
  { icon: CameraIcon, text: "Take a photo of anything nearby. It is sealed the moment you take it." },
  { icon: CopiesIcon, text: "Edit it or send it to yourself, then see what the verifier says about the copy." },
] as const;

/** Where the landing page's QR code points: one tap from a desktop visitor's phone into the demo. */
export default function TryPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-4 py-12">
      <div className="flex flex-col gap-3">
        <p className="eyebrow">Proofshot demo · about a minute</p>
        <h1 className="text-3xl font-semibold tracking-tight">Seal a photo on this phone, then try to fool it</h1>
      </div>
      <ol className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-5">
        {STEPS.map(({ icon: Icon, text }, i) => (
          <li key={text} className="flex gap-3">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent text-sm font-semibold text-accent-fg" aria-hidden="true">
              {i + 1}
            </span>
            <span className="flex gap-2 pt-1">
              <Icon className="mt-0.5 size-5 shrink-0 text-muted" />
              <span>{text}</span>
            </span>
          </li>
        ))}
      </ol>
      <StartDemoButton label="Start the demo" />
      <p className="text-sm text-muted">No sign-up. Demo photos stay on this phone; only their fingerprints are recorded.</p>
    </main>
  );
}
