"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { AlterationCheck, VerdictKind } from "@/components/verdict/copy";
import { TileMap } from "@/components/verdict/tile-map";
import { VerdictPanel } from "@/components/verdict/verdict-panel";

interface Result {
  id: string;
  receiptUrl: string;
  verdict: VerdictKind;
  alterationCheck: AlterationCheck;
  alteredTiles: number[];
  record: { kind: "sealed" | "imported"; sealedAt: string } | null;
}

type State =
  | { name: "idle" }
  | { name: "checking"; file: File; uploaded: number }
  | { name: "done"; file: File; result: Result }
  /** `retry` keeps the chosen file when the failure is ours or temporary (rate limit, registry, network). */
  | { name: "error"; message: string; retry?: File };

const ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif";
const MAX_BYTES = 20 * 1024 * 1024;

/** POST with upload progress (fetch can't report it); resolves with status and parsed JSON. */
function postWithProgress(url: string, body: FormData, onProgress: (fraction: number) => void) {
  return new Promise<{ status: number; body: Record<string, unknown> }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.responseType = "json";
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => resolve({ status: xhr.status, body: (xhr.response as Record<string, unknown>) ?? {} });
    xhr.onerror = () => reject(new Error("network"));
    xhr.send(body);
  });
}

export function Verifier() {
  const [state, setState] = useState<State>({ name: "idle" });
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<{ url: string; width: number; height: number } | null>(null);

  const file = state.name === "checking" || state.name === "done" ? state.file : null;
  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => setPreview({ url, width: img.naturalWidth, height: img.naturalHeight });
    img.src = url; // HEIC won't render outside Safari; the Verdict still shows.
    return () => {
      URL.revokeObjectURL(url);
      setPreview(null);
    };
  }, [file]);

  async function check(f: File) {
    if (state.name === "checking") return; // one check at a time, even for a drop while busy
    if (f.size > MAX_BYTES) return setState({ name: "error", message: "This image is larger than 20 MB." });
    setState({ name: "checking", file: f, uploaded: 0 });
    const form = new FormData();
    form.set("file", f);
    try {
      const res = await postWithProgress("/api/verify", form, (uploaded) => setState({ name: "checking", file: f, uploaded }));
      if (res.status < 200 || res.status >= 300) {
        const message =
          (res.body.error as string | undefined) ??
          (res.status === 413 ? "This image is too large to upload." : "Something went wrong on our side. Try again.");
        // 429 and 5xx are about timing, not the file: offer to send the same file again.
        return setState({ name: "error", message, retry: res.status === 429 || res.status >= 500 ? f : undefined });
      }
      setState({ name: "done", file: f, result: res.body as unknown as Result });
    } catch {
      setState({ name: "error", message: "We couldn't reach the verifier. Check your connection and try again.", retry: f });
    }
  }

  const reset = () => {
    setState({ name: "idle" });
    if (inputRef.current) inputRef.current.value = "";
  };

  if (state.name === "done") {
    const r = state.result;
    return (
      <div className="flex flex-col gap-4">
        <VerdictPanel
          view={{ ...r, record: r.record ? { kind: r.record.kind, sealedAt: new Date(r.record.sealedAt) } : null }}
        />
        {r.verdict === "altered" && preview ? (
          <TileMap src={preview.url} alteredTiles={r.alteredTiles} width={preview.width} height={preview.height} />
        ) : r.verdict === "altered" ? (
          // This browser can't display the file (e.g. HEIC outside Safari): keep the regions as text.
          <p className="rounded-md border border-line bg-surface p-3 text-sm">
            {r.alteredTiles.length} of 16 regions differ from the sealed photo (row, column on a 4×4 grid):{" "}
            {r.alteredTiles.map((i) => `${Math.floor(i / 4) + 1},${(i % 4) + 1}`).join("; ")}. This browser can&apos;t display
            the file itself to draw the map.
          </p>
        ) : (
          <div className="flex items-center gap-3 rounded-md border border-line bg-surface p-3 text-sm">
            {preview && (
              /* eslint-disable-next-line @next/next/no-img-element -- the viewer's own file, in-session only */
              <img src={preview.url} alt="" className="size-14 shrink-0 rounded object-cover" />
            )}
            <div className="min-w-0">
              <p className="truncate font-medium">{state.file.name}</p>
              <p className="text-muted">Checked just now · image not stored</p>
            </div>
          </div>
        )}
        <div className="flex flex-wrap gap-3">
          <Link href={r.receiptUrl} className="btn-primary">
            Open Verification Receipt
          </Link>
          <button type="button" onClick={reset} className="btn-secondary">
            Check another image
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <label
        htmlFor="verify-file"
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const f = e.dataTransfer.files[0];
          if (f && state.name !== "checking") void check(f);
        }}
        className={`flex min-h-48 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-center has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent ${
          dragging ? "border-accent bg-surface" : "border-line bg-surface/50 hover:border-foreground/30"
        }`}
      >
        {state.name === "checking" ? (
          <span role="status" className="flex w-full max-w-xs flex-col items-center gap-2">
            <span className="flex items-center gap-2">
              <span className="size-4 animate-spin rounded-full border-2 border-line border-t-accent" aria-hidden="true" />
              {state.uploaded < 1 ? `Uploading ${state.file.name}… ${Math.round(state.uploaded * 100)}%` : `Checking ${state.file.name}…`}
            </span>
            <progress className="h-1.5 w-full" max={1} value={state.uploaded < 1 ? state.uploaded : undefined} aria-label="Upload progress" />
          </span>
        ) : (
          <>
            <svg viewBox="0 0 24 24" className="size-8 text-muted" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
              <path d="M12 16V4m0 0l-4 4m4-4l4 4" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" strokeLinecap="round" />
            </svg>
            <span className="font-medium">Drop an image here, or choose a file</span>
            <span className="text-sm text-muted">JPEG, PNG, WebP or HEIC, up to 20 MB</span>
          </>
        )}
        <input
          ref={inputRef}
          id="verify-file"
          type="file"
          accept={ACCEPT}
          className="sr-only"
          disabled={state.name === "checking"}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void check(f);
          }}
        />
      </label>

      {state.name === "error" && (
        <div role="alert" className="flex flex-wrap items-center gap-3">
          <p className="text-danger">{state.message}</p>
          {state.retry && (
            <button type="button" className="btn-secondary max-w-full text-left [overflow-wrap:anywhere]" onClick={() => void check(state.retry!)}>
              Try again with {state.retry.name}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
