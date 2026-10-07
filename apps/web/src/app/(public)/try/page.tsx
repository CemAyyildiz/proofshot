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
    <main className="ink relative flex flex-1 flex-col overflow-hidden">
      <div className="glow-bg absolute inset-0" aria-hidden="true" />
      <div className="relative mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-8 px-4 py-10">
        <div className="flex flex-col gap-4">
          <p className="eyebrow">Proofshot demo · about a minute</p>
          <h1 className="display text-[2.6rem] sm:text-5xl">
            Seal a photo on this phone, then <span className="mark">try to fool it</span>
          </h1>
        </div>
        <ol className="flex flex-col">
          {STEPS.map(({ icon: Icon, text }, i) => (
            <li key={text} className="flex items-start gap-4 border-t border-line py-4 last:border-b">
              <span className="display w-9 shrink-0 text-3xl text-brand" aria-hidden="true">
                {i + 1}
              </span>
              <span className="flex-1 pt-0.5">{text}</span>
              <Icon className="mt-1 size-5 shrink-0 text-muted" />
            </li>
          ))}
        </ol>
        <div className="flex flex-col gap-3">
          <StartDemoButton label="Start the demo" />
          <p className="text-sm text-muted">No sign-up. Demo photos stay on this phone; only their fingerprints are recorded.</p>
        </div>
      </div>
    </main>
  );
}
