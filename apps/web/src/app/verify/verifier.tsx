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
        {r.verdict === "altered" && preview && <TileMap src={preview.url} alteredTiles={r.alteredTiles} width={preview.width} height={preview.height} />}
        <div className="flex flex-wrap gap-3">
          <Link href={r.receiptUrl} className="btn-primary">
            Open Verification Receipt
          </Link>
          <button type="button" onClick={reset} className="rounded-md border border-line px-4 py-2.5">
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
          dragging ? "border-accent bg-surface" : "border-line"
        }`}
      >
        {state.name === "checking" ? (
          <span role="status">Checking {state.file.name}…</span>
        ) : (
          <>
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
