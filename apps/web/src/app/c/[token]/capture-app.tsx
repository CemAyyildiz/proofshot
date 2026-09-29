"use client";

import { useEffect, useState } from "react";
import { LogoMark } from "@/components/brand/logo";
import { CameraIcon, LockIcon } from "@/components/icons";
import { CaptureScreen } from "./capture-screen";
import { SUPPORTED_BROWSERS, createPasskey, loadDeviceKey, passkeySupported, saveDeviceKey, type StoredDeviceKey } from "@/lib/passkey";

type Step =
  | { name: "checking" }
  | { name: "unsupported" }
  | { name: "intro" }
  | { name: "enrolling" }
  | { name: "enroll-error"; message: string }
  | { name: "ready"; key: StoredDeviceKey };

export interface CaptureAppProps {
  token: string;
  carrierName: string;
  reference: string;
  /** Public demo (FR-18): no insurer to send to; guide the visitor to try to fool the verifier instead. */
  sandbox?: boolean;
}

export function CaptureApp({ token, carrierName, reference, sandbox = false }: CaptureAppProps) {
  const [step, setStep] = useState<Step>({ name: "checking" });

  useEffect(() => {
    let live = true;
    (async () => {
      if (!(await passkeySupported())) return live && setStep({ name: "unsupported" });
      const key = loadDeviceKey();
      if (live) setStep(key ? { name: "ready", key } : { name: "intro" });
    })();
    return () => {
      live = false;
    };
  }, []);

  async function enroll() {
    setStep({ name: "enrolling" });
    try {
      const passkey = await createPasskey();
      const res = await fetch(`/api/claim-links/${token}/device-keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(passkey),
      });
      const body = (await res.json()) as { keyId?: `0x${string}`; error?: string };
      if (!res.ok || !body.keyId) throw new Error(body.error ?? "We couldn't set up this device.");
      const key = { credentialId: passkey.credentialId, keyId: body.keyId };
      saveDeviceKey(key);
      setStep({ name: "ready", key });
    } catch (err) {
      const cancelled = err instanceof DOMException && (err.name === "NotAllowedError" || err.name === "AbortError");
      setStep({
        name: "enroll-error",
        message: cancelled ? "Setup was cancelled. Tap the button to try again." : err instanceof Error && !(err instanceof DOMException) ? err.message : "We couldn't set up this device. Try again.",
      });
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-4 pb-8 pt-4">
      <div className="flex items-center justify-between text-sm text-muted">
        <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
          <LogoMark className="size-5" /> Proofshot
        </span>
        <span className="inline-flex items-center gap-1">
          <LockIcon className="size-3.5" /> Secure link
        </span>
      </div>
      <header>
        <p className="eyebrow">{carrierName}</p>
        <h1 className="mt-1 text-2xl font-semibold">{sandbox ? "Take a photo of anything nearby" : "Take photos of the damage"}</h1>
        {!sandbox && <p className="text-muted">Claim {reference}</p>}
      </header>

      {step.name === "checking" && <p className="text-muted">Getting ready…</p>}

      {step.name === "unsupported" && (
        <p role="alert" className="rounded-md border border-line bg-surface p-4">
          This browser can&apos;t seal photos. Open this link in {SUPPORTED_BROWSERS}.
        </p>
      )}

      {(step.name === "intro" || step.name === "enrolling" || step.name === "enroll-error") && (
        <section className="flex flex-col gap-4">
          <ol className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4">
            <li className="flex gap-3">
              <LockIcon className="mt-0.5 size-5 shrink-0 text-muted" />
              <span>Confirm with Face ID, your fingerprint or your phone&apos;s PIN. Nothing to install.</span>
            </li>
            <li className="flex gap-3">
              <CameraIcon className="mt-0.5 size-5 shrink-0 text-muted" />
              <span>Take the photos here. Each one is sealed the moment you take it.</span>
            </li>
            <li className="flex gap-3">
              <svg viewBox="0 0 24 24" className="mt-0.5 size-5 shrink-0 text-muted" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 12l16-8-6 16-2.5-6.5z" />
              </svg>
              <span>{sandbox ? "Then try to fool the verifier with a changed copy." : `Send them to ${carrierName}. Only they receive your photos.`}</span>
            </li>
          </ol>
          {step.name === "enroll-error" && (
            <p role="alert" className="text-danger">
              {step.message}
            </p>
          )}
          <button type="button" className="btn-primary min-h-12 text-base" onClick={enroll} disabled={step.name === "enrolling"}>
            {step.name === "enrolling" ? "Setting up…" : "Continue"}
          </button>
        </section>
      )}

      {step.name === "ready" && <CaptureScreen token={token} deviceKey={step.key} sandbox={sandbox} />}
    </main>
  );
}
