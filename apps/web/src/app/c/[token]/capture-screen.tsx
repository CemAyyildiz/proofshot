"use client";

import type { Fingerprint } from "@proofshot/fingerprint/browser";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ConfirmAction } from "@/components/confirm-action";
import { type StoredCapture, deleteCapture, listCaptures, putCapture } from "@/lib/capture-store";
import type { StoredDeviceKey } from "@/lib/passkey";
import { GENERIC_SEAL_MESSAGE, SealError, currentLocationIfAllowed, fingerprintCapture, grabFrame, signAndSeal, warmUpFingerprinting } from "@/lib/seal-pipeline";

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
  /** The Carrier revoked (or the link expired) mid-session: no new Seals, but everything sealed stays valid. */
  const [linkClosed, setLinkClosed] = useState(false);
  /** A limit that won't lift within minutes (link full, today's limit): stop the shutter and say why, once. */
  const [limitNotice, setLimitNotice] = useState<string | null>(null);
  const stopped = linkClosed || limitNotice !== null;
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
        let current: StoredCapture = { ...capture, status: "processing", error: undefined, failure: undefined };
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
          else if (e instanceof SealError) {
            update({ ...current, status: "failed", error: e.message, failure: e.reason });
            if (e.reason === "link-closed") setLinkClosed(true);
            if (e.reason === "limit") setLimitNotice(e.message);
          } else {
            // Anything else (decoding, storage) is not the Capturer's to act on beyond a retry; keep details in the console.
            console.warn("[capture] seal failed", e);
            update({ ...current, status: "failed", error: GENERIC_SEAL_MESSAGE, failure: "other" });
          }
        } finally {
          release();
        }
      });
    },
    [deviceKey, token, update],
  );

  // Photos that failed only because the connection dropped seal on their own once it's back.
  const capturesRef = useRef(captures);
  useEffect(() => {
    capturesRef.current = captures;
  }, [captures]);
  useEffect(() => {
    const retryOffline = () => {
      for (const c of capturesRef.current) if (c.status === "failed" && c.failure === "offline") seal(c, performance.now());
    };
    window.addEventListener("online", retryOffline);
    return () => window.removeEventListener("online", retryOffline);
  }, [seal]);

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
    } catch (e) {
      console.warn("[capture] frame grab failed", e);
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
    let reason = "Check your connection and try again.";
    for (const c of ready) {
      const res = await fetch(`/api/claim-links/${token}/captures/${c.exactHash}/file`, {
        method: "PUT",
        headers: { "Content-Type": "image/jpeg" },
        body: c.blob,
      }).catch(() => null);
      if (res?.ok) update({ ...c, status: "sent" });
      else {
        failed++;
        // A reply from the server says what's wrong; only a missing reply means the connection.
        if (res) reason = ((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Try again in a moment.";
      }
    }
    setSending(false);
    if (failed > 0) {
      setSendError(`${failed} photo${failed === 1 ? "" : "s"} couldn't be sent. ${reason}`);
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
      {linkClosed && (
        <div role="alert" className="rounded-md border border-danger bg-surface p-3 text-sm">
          <p className="font-semibold">This link is no longer active</p>
          <p className="text-muted">
            New photos can&apos;t be sealed with it. Photos already sealed stay valid and can still be sent. Ask your
            insurer for a new link to take more.
          </p>
        </div>
      )}
      {!linkClosed && limitNotice && (
        <div role="alert" className="rounded-md border border-danger bg-surface p-3 text-sm">
          <p className="font-semibold">No more photos can be sealed right now</p>
          <p className="text-muted">
            {limitNotice} Photos already sealed stay valid and can still be sent.
          </p>
        </div>
      )}
      {/* Width follows the height budget so the viewfinder, shutter and count fit one screen in any orientation. */}
      <div className="relative mx-auto w-full overflow-hidden rounded-xl bg-black" style={{ maxWidth: "min(100%, calc(58svh * 3 / 4))" }}>
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
          disabled={camera.state !== "on" || inFlightCount >= MAX_IN_FLIGHT || stopped}
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
              <div className="relative">
                <Thumb
                  blob={c.blob}
                  className={`aspect-[3/4] w-full rounded object-cover ring-2 transition-[box-shadow] ${
                    c.status === "sealed" || c.status === "sent" ? "ring-verdict-original" : c.status === "failed" ? "ring-danger" : "ring-transparent"
                  }`}
                />
                {(c.status === "sealed" || c.status === "sent") && (
                  <span aria-hidden="true" className="seal-pop absolute right-1 top-1 grid size-6 place-items-center rounded-full bg-verdict-original text-verdict-fg shadow">
                    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12.5l4.5 4.5L19 7" />
                    </svg>
                  </span>
                )}
                {(c.status === "processing" || c.status === "sealing") && (
                  <span aria-hidden="true" className="absolute right-1 top-1 size-5 animate-spin rounded-full border-2 border-white/60 border-t-white" />
                )}
              </div>
              <CaptureStatusLine capture={c} canRetry={!stopped} />
              {/* A limit is explained once, in the banner above, not under every photo. */}
              {c.status === "failed" && c.error && c.error !== "Not sealed — retry" && c.failure !== "limit" && (
                <span className="text-xs text-muted">{c.error}</span>
              )}
              {c.status === "failed" && (
                <span className="flex flex-wrap gap-x-3 text-sm">
                  {!stopped && (
                    <button type="button" className="min-h-9 underline underline-offset-4" onClick={() => seal(c, performance.now())}>
                      Retry
                    </button>
                  )}
                  <ConfirmAction
                    trigger="Discard"
                    triggerClassName="min-h-9 underline underline-offset-4"
                    question="Delete this photo?"
                    confirmLabel="Delete"
                    onConfirm={() => discard(c)}
                  />
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

function CaptureStatusLine({ capture: c, canRetry }: { capture: StoredCapture; canRetry: boolean }) {
  const text =
    c.status === "sealed"
      ? `Sealed ✓${c.sealMs !== undefined ? ` · ${(c.sealMs / 1000).toFixed(1)} s` : ""}`
      : c.status === "sent"
        ? "Sent ✓"
        : c.status === "failed"
          ? canRetry
            ? "Not sealed — retry"
            : "Not sealed"
          : "Sealing…";
  return (
    <span role="status" className="text-xs font-medium">
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
  // On a phone the guide lands below the viewfinder, out of sight: bring it into view once, when the first Seal lands.
  const ref = useRef<HTMLElement>(null);
  const shown = Boolean(capture && url);
  useEffect(() => {
    if (!shown) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    ref.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "nearest" });
  }, [shown]);
  if (!capture || !url) return <p className="text-sm text-muted">Take a photo. It&apos;s sealed as soon as you confirm.</p>;
  return (
    <section ref={ref} aria-labelledby="fool-heading" className="flex scroll-mb-4 flex-col gap-3 rounded-md border border-line bg-surface p-4">
      <h2 id="fool-heading" className="text-lg font-semibold">
        Now try to fool it
      </h2>
      <ol className="ml-5 list-decimal space-y-2 text-sm">
        <li>
          <a href={url} download={`proofshot-${capture.createdAt}.jpg`} className="font-medium underline underline-offset-4">
            Save your sealed photo
          </a>
        </li>
        <li>
          Change it: paint over a detail, or send it to yourself on WhatsApp and save the copy. (A crop beyond a thin
          edge comes back &ldquo;No Record&rdquo;, a known limit.)
        </li>
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
