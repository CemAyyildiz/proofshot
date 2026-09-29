"use client";

import type { Fingerprint } from "@proofshot/fingerprint/browser";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type StoredCapture, deleteCapture, listCaptures, putCapture } from "@/lib/capture-store";
import type { StoredDeviceKey } from "@/lib/passkey";
import { SealError, currentLocationIfAllowed, fingerprintCapture, grabFrame, signAndSeal, warmUpFingerprinting } from "@/lib/seal-pipeline";

/** FR-5: up to 10 photos may be in flight before the shutter waits. */
const MAX_IN_FLIGHT = 10;

type Camera = { state: "starting" } | { state: "on" } | { state: "denied" } | { state: "unavailable" };

/** Rear camera at up to 12 MP, attached to `video`. Resolves to the resulting camera state. */
async function openCamera(video: HTMLVideoElement): Promise<Camera> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: "environment" }, width: { ideal: 4032 }, height: { ideal: 3024 } },
    });
    video.srcObject = stream;
    await video.play().catch(() => undefined);
    // The shutter is only enabled once the stream has real frames; before that a capture would be empty.
    if (!video.videoWidth) {
      await new Promise<void>((resolve) => {
        const done = () => resolve();
        video.addEventListener("loadeddata", done, { once: true });
        setTimeout(done, 3_000);
      });
    }
    return video.videoWidth ? { state: "on" } : { state: "unavailable" };
  } catch (e) {
    return { state: e instanceof DOMException && e.name === "NotAllowedError" ? "denied" : "unavailable" };
  }
}

const inFlight = (c: StoredCapture) => c.status === "processing" || c.status === "sealing";

export function CaptureScreen({ token, deviceKey, sandbox = false }: { token: string; deviceKey: StoredDeviceKey; sandbox?: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [camera, setCamera] = useState<Camera>({ state: "starting" });
  const [captures, setCaptures] = useState<StoredCapture[]>([]);
  const [sending, setSending] = useState(false);
  const [sentView, setSentView] = useState<{ skipped: number } | null>(null);
  const [sendError, setSendError] = useState("");
  const fingerprints = useRef(new Map<string, Fingerprint>());
  const signQueue = useRef<Promise<void>>(Promise.resolve());

  const update = useCallback((c: StoredCapture) => {
    setCaptures((all) => {
      const i = all.findIndex((x) => x.id === c.id);
      return i < 0 ? [...all, c] : all.map((x) => (x.id === c.id ? c : x));
    });
    void putCapture(c);
  }, []);

  // Camera lifecycle.
  const retryCamera = () => {
    setCamera({ state: "starting" });
    if (videoRef.current) void openCamera(videoRef.current).then(setCamera);
  };

  useEffect(() => {
    const video = videoRef.current;
    if (video) void openCamera(video).then(setCamera);
    void warmUpFingerprinting();
    return () => (video?.srcObject as MediaStream | null)?.getTracks().forEach((t) => t.stop());
  }, []);

  // Photos from an earlier visit on this device. Anything interrupted mid-seal is offered for retry.
  useEffect(() => {
    listCaptures(token).then((rows) =>
      setCaptures(rows.map((c) => (inFlight(c) ? { ...c, status: "failed", error: "Not sealed — retry" } : c))),
    );
  }, [token]);

  /** Runs one Capture through fingerprint → sign → seal. Signing is serialised; sealing runs concurrently. */
  const seal = useCallback(
    (capture: StoredCapture, startedAt: number) => {
      const prev = signQueue.current;
      let release!: () => void;
      signQueue.current = new Promise<void>((r) => (release = r));
      void prev.then(async () => {
        let current: StoredCapture = { ...capture, status: "processing", error: undefined };
        update(current);
        try {
          let fp = fingerprints.current.get(capture.id);
          if (!fp) fingerprints.current.set(capture.id, (fp = await fingerprintCapture(capture.blob)));
          current = { ...current, exactHash: fp.exactHash };
          update(current);
          const outcome = await signAndSeal({
            token,
            key: deviceKey,
            fingerprint: fp,
            location: capture.location,
            deviceTime: capture.createdAt,
            onSigned: () => {
              current = { ...current, status: "sealing" };
              update(current);
              release();
            },
          });
          const sealMs = performance.now() - startedAt;
          update({ ...current, status: "sealed", receiptUrl: outcome.receiptUrl, sealMs });
          void fetch(`/api/claim-links/${token}/captures/${fp.exactHash}/timings`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ shutterToSignedMs: outcome.signedAt - startedAt, shutterToSealedMs: sealMs }),
          }).catch(() => undefined);
        } catch (e) {
          if (e instanceof SealError && e.alreadySealed) update({ ...current, status: "sealed", receiptUrl: e.receiptUrl });
          else update({ ...current, status: "failed", error: e instanceof Error ? e.message : "This photo couldn't be sealed. Tap retry." });
        } finally {
          release();
        }
      });
    },
    [deviceKey, token, update],
  );

  async function shoot() {
    const video = videoRef.current;
    if (!video || camera.state !== "on") return;
    const startedAt = performance.now();
    const createdAt = Date.now();
    try {
      const [blob, location] = await Promise.all([grabFrame(video), currentLocationIfAllowed()]);
      const capture: StoredCapture = { id: crypto.randomUUID(), token, createdAt, blob, status: "processing", location };
      update(capture);
      seal(capture, startedAt);
      setSendError("");
    } catch {
      setSendError("The camera didn't return a photo. Try again.");
    }
  }

  async function discard(c: StoredCapture) {
    setCaptures((all) => all.filter((x) => x.id !== c.id));
    fingerprints.current.delete(c.id);
    await deleteCapture(c.id);
  }

  async function sendToInsurer() {
    setSending(true);
    setSendError("");
    const ready = captures.filter((c) => c.status === "sealed" && c.exactHash);
    let failed = 0;
    for (const c of ready) {
      const res = await fetch(`/api/claim-links/${token}/captures/${c.exactHash}/file`, {
        method: "PUT",
        headers: { "Content-Type": "image/jpeg" },
        body: c.blob,
      }).catch(() => null);
      if (res?.ok) update({ ...c, status: "sent" });
      else failed++;
    }
    setSending(false);
    if (failed > 0) {
      setSendError(`${failed} photo${failed === 1 ? "" : "s"} couldn't be sent. Check your connection and try again.`);
      return;
    }
    setSentView({ skipped: captures.filter((c) => c.status !== "sealed" && c.status !== "sent").length });
  }

  const inFlightCount = captures.filter(inFlight).length;
  const sealedCount = captures.filter((c) => c.status === "sealed").length;
  const sent = captures.filter((c) => c.status === "sent");

  if (sentView) {
    return (
      <section aria-labelledby="sent-heading" className="flex flex-col gap-4">
        <h2 id="sent-heading" className="text-xl font-semibold">
          Sent to your insurer
        </h2>
        {sentView.skipped > 0 && (
          <p className="text-sm text-muted">
            {sentView.skipped} photo{sentView.skipped === 1 ? " wasn't" : "s weren't"} sealed and {sentView.skipped === 1 ? "was" : "were"} not sent.
          </p>
        )}
        <p className="text-sm text-muted">Keep these receipt links. Anyone can use them to check your photos are genuine.</p>
        <ul className="grid grid-cols-2 gap-3">
          {sent.map((c) => (
            <li key={c.id} className="flex flex-col gap-1 rounded-md border border-line bg-surface p-2">
              <Thumb blob={c.blob} className="aspect-[4/3] w-full rounded object-cover" />
              <span className="text-sm font-medium">✓ Sealed {new Date(c.createdAt).toLocaleTimeString("en-GB")}</span>
              {c.receiptUrl && (
                <a href={c.receiptUrl} className="text-sm underline underline-offset-4">
                  Receipt
                </a>
              )}
            </li>
          ))}
        </ul>
        <button type="button" className="rounded-md border border-line px-4 py-3" onClick={() => setSentView(null)}>
          Take more photos
        </button>
      </section>
    );
  }

  return (
    <section aria-label="Camera" className="flex flex-col gap-3">
      <div className="relative overflow-hidden rounded-xl bg-black">
        <video ref={videoRef} playsInline muted autoPlay className="aspect-[3/4] w-full object-cover" aria-label="Camera preview" />
        {camera.state === "starting" && <p className="absolute inset-0 grid place-items-center text-white">Starting camera…</p>}
        {(camera.state === "denied" || camera.state === "unavailable") && (
          <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/85 p-6 text-center text-white">
            <p>
              {camera.state === "denied"
                ? "Proofshot needs your camera to take sealed photos. Allow camera access for this site in your browser settings, then try again."
                : "No camera was found on this device. Open this link on your phone."}
            </p>
            <button type="button" className="rounded-md bg-white px-4 py-2 font-medium text-black" onClick={retryCamera}>
              Try again
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-col items-center gap-2 py-1">
        <button
          type="button"
          onClick={shoot}
          disabled={camera.state !== "on" || inFlightCount >= MAX_IN_FLIGHT}
          aria-label="Take photo"
          className="grid size-20 place-items-center rounded-full border-4 border-foreground bg-transparent active:scale-95 disabled:opacity-40"
        >
          <span className="size-15 rounded-full bg-foreground" />
        </button>
        <p className="text-sm text-muted" aria-live="polite">
          {inFlightCount >= MAX_IN_FLIGHT
            ? "Waiting for earlier photos to seal…"
            : captures.length === 0
              ? "Tap to take a sealed photo"
              : `${captures.length} photo${captures.length === 1 ? "" : "s"} · ${sealedCount + captures.filter((c) => c.status === "sent").length} sealed`}
        </p>
      </div>

      {captures.length > 0 && (
        <ul aria-label="Your photos" className="flex gap-2 overflow-x-auto pb-1">
          {captures.map((c) => (
            <li key={c.id} className="flex w-28 shrink-0 flex-col gap-1">
              <Thumb blob={c.blob} className="aspect-[3/4] w-full rounded object-cover" />
              <CaptureStatusLine capture={c} />
              {c.status === "failed" && (
                <span className="flex gap-2 text-xs">
                  <button type="button" className="underline" onClick={() => seal(c, performance.now())}>
                    Retry
                  </button>
                  <button type="button" className="underline" onClick={() => discard(c)}>
                    Discard
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {sendError && (
        <p role="alert" className="text-danger">
          {sendError}
        </p>
      )}
      {sandbox ? (
        <TryToFoolIt capture={[...captures].reverse().find((c) => c.status === "sealed")} />
      ) : (
        <button type="button" className="btn-primary py-3" disabled={sealedCount === 0 || sending} onClick={sendToInsurer}>
          {sending ? "Sending…" : sealedCount > 0 ? `Send ${sealedCount} photo${sealedCount === 1 ? "" : "s"} to insurer` : "Send to insurer"}
        </button>
      )}
    </section>
  );
}

function CaptureStatusLine({ capture: c }: { capture: StoredCapture }) {
  const text =
    c.status === "sealed"
      ? `Sealed ✓${c.sealMs !== undefined ? ` · ${(c.sealMs / 1000).toFixed(1)} s` : ""}`
      : c.status === "sent"
        ? "Sent ✓"
        : c.status === "failed"
          ? "Not sealed — retry"
          : "Sealing…";
  return (
    <span role="status" className="text-xs font-medium" title={c.status === "failed" ? c.error : undefined}>
      {text}
    </span>
  );
}

function Thumb({ blob, className }: { blob: Blob; className: string }) {
  const url = useMemo(() => URL.createObjectURL(blob), [blob]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  // eslint-disable-next-line @next/next/no-img-element -- local object URL, not an optimisable asset
  return <img src={url} alt="" className={className} />;
}

/** FR-18: after the first Seal, walk the visitor through trying to fool the verifier. */
function TryToFoolIt({ capture }: { capture?: StoredCapture }) {
  const url = useMemo(() => (capture ? URL.createObjectURL(capture.blob) : null), [capture]);
  useEffect(() => () => (url ? URL.revokeObjectURL(url) : undefined), [url]);
  if (!capture || !url) return <p className="text-sm text-muted">Take a photo. It&apos;s sealed as soon as you confirm.</p>;
  return (
    <section aria-labelledby="fool-heading" className="flex flex-col gap-3 rounded-md border border-line bg-surface p-4">
      <h2 id="fool-heading" className="text-lg font-semibold">
        Now try to fool it
      </h2>
      <ol className="ml-5 list-decimal space-y-2 text-sm">
        <li>
          <a href={url} download={`proofshot-${capture.createdAt}.jpg`} className="font-medium underline underline-offset-4">
            Save your sealed photo
          </a>
        </li>
        <li>Change it: paint over a detail, crop it, or send it to yourself on WhatsApp and save the copy.</li>
        <li>
          <a href="/verify" target="_blank" rel="noopener" className="font-medium underline underline-offset-4">
            Drop the copy into the verifier
          </a>{" "}
          and see what it says.
        </li>
      </ol>
      {capture.receiptUrl && (
        <a href={capture.receiptUrl} className="text-sm text-muted underline underline-offset-4">
          View this photo&apos;s seal receipt
        </a>
      )}
    </section>
  );
}
