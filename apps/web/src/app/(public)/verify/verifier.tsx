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

type State = { name: "idle" } | { name: "checking"; file: File } | { name: "done"; file: File; result: Result } | { name: "error"; message: string };

const ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif";
const MAX_BYTES = 20 * 1024 * 1024;

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
    if (f.size > MAX_BYTES) return setState({ name: "error", message: "This image is larger than 20 MB." });
    setState({ name: "checking", file: f });
    const form = new FormData();
    form.set("file", f);
    try {
      const res = await fetch("/api/verify", { method: "POST", body: form });
      const body = await res.json();
      if (!res.ok) return setState({ name: "error", message: body.error ?? "Something went wrong. Try again." });
      setState({ name: "done", file: f, result: body as Result });
    } catch {
      setState({ name: "error", message: "We couldn't reach the verifier. Check your connection and try again." });
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
        ) : (
          <div className="flex items-center gap-3 rounded-md border border-line bg-surface p-3 text-sm">
            {preview && (
              /* eslint-disable-next-line @next/next/no-img-element -- the viewer's own file, in-session only */
              <img src={preview.url} alt="" className="size-14 shrink-0 rounded object-cover" />
            )}
            <div className="min-w-0">
              <p className="truncate font-medium">{state.file.name}</p>
              <p className="text-muted">Checked just now · not stored</p>
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
          if (f) void check(f);
        }}
        className={`flex min-h-48 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-center ${
          dragging ? "border-accent bg-surface" : "border-line bg-surface/50 hover:border-foreground/30"
        }`}
      >
        {state.name === "checking" ? (
          <span role="status" className="flex items-center gap-2">
            <span className="size-4 animate-spin rounded-full border-2 border-line border-t-accent" aria-hidden="true" />
            Checking {state.file.name}…
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
      </label>
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
      {state.name === "error" && (
        <p role="alert" className="text-danger">
          {state.message}
        </p>
      )}
    </div>
  );
}
