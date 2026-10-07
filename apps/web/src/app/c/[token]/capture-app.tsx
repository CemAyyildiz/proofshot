"use client";

import { useEffect, useState } from "react";
import { Wordmark } from "@/components/brand/logo";
import { CameraIcon, LockIcon, SendIcon } from "@/components/icons";
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
  /** When the Claim Link expires, formatted on the server. */
  validUntil?: string;
  /** Public demo (FR-18): no insurer to send to; guide the visitor to try to fool the verifier instead. */
  sandbox?: boolean;
}

export function CaptureApp({ token, carrierName, reference, validUntil, sandbox = false }: CaptureAppProps) {
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
    <main className="ink flex flex-1 flex-col">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-4 pb-8 pt-3">
        <div className="flex min-h-11 items-center justify-between">
          <Wordmark />
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-[0.7rem] font-semibold uppercase tracking-wider text-muted">
            <LockIcon className="size-3.5" />
            Sealed at capture
          </span>
        </div>
        {/* Who is asking comes first: it is the one thing a policyholder can check against what they expect. */}
        <header className="flex flex-col gap-1">
          {sandbox ? (
            <p className="eyebrow [overflow-wrap:anywhere]">{carrierName}</p>
          ) : (
            <>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">Requested by</p>
              <p className="text-lg font-semibold [overflow-wrap:anywhere]">{carrierName}</p>
            </>
          )}
          <h1 className="display mt-1 text-3xl">{sandbox ? "Take a photo of anything nearby" : "Take photos of the damage"}</h1>
          {!sandbox && (
            <>
              <p className="text-muted [overflow-wrap:anywhere]">Claim {reference}</p>
              {validUntil && <p className="text-sm text-muted">Link valid until {validUntil}</p>}
            </>
          )}
        </header>

        {step.name === "checking" && <p className="text-muted">Getting ready…</p>}

        {step.name === "unsupported" && (
          <p role="alert" className="card p-4">
            This browser can&apos;t seal photos. Open this link in {SUPPORTED_BROWSERS}.
          </p>
        )}

        {(step.name === "intro" || step.name === "enrolling" || step.name === "enroll-error") && (
          <section className="flex flex-1 flex-col gap-5">
            <ol className="flex flex-col">
              {[
                { icon: LockIcon, text: "Confirm with Face ID, your fingerprint or your phone's PIN. Nothing to install." },
                { icon: CameraIcon, text: "Take the photos here. Each one is sealed the moment you take it." },
                { icon: SendIcon, text: sandbox ? "Then try to fool the verifier with a changed copy." : `Send them to ${carrierName}. Only they receive your photos.` },
              ].map(({ icon: Icon, text }, i) => (
                <li key={i} className="flex items-start gap-4 border-t border-line py-4 last:border-b">
                  <span className="display w-9 shrink-0 text-3xl text-brand" aria-hidden="true">
                    {i + 1}
                  </span>
                  <span className="flex-1 pt-0.5">{text}</span>
                  <Icon className="mt-1 size-5 shrink-0 text-muted" />
                </li>
              ))}
            </ol>
            {step.name === "enroll-error" && (
              <p role="alert" className="text-danger">
                {step.message}
              </p>
            )}
            <button type="button" className="btn-primary min-h-14 text-lg" onClick={enroll} disabled={step.name === "enrolling"}>
              {step.name === "enrolling" ? "Setting up…" : "Continue"}
            </button>
            {!sandbox && (
              <p className="text-sm text-muted">
                Not expecting this link? Don&apos;t continue. Contact {carrierName} using the details on your policy, not
                the message that brought you here.
              </p>
            )}
          </section>
        )}

        {step.name === "ready" && <CaptureScreen token={token} deviceKey={step.key} carrierName={carrierName} sandbox={sandbox} />}
      </div>
    </main>
  );
}
