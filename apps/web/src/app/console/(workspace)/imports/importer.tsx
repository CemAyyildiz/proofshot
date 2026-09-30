"use client";

import { unzipSync } from "fflate";
import { useEffect, useState } from "react";

const MAX_FILES = 500;
const MAX_BYTES = 20 * 1024 * 1024;
const BATCH = 10;
const IMAGE = /\.(jpe?g|png|webp|heic|heif)$/i;

interface Row {
  name: string;
  status: "imported" | "unreadable" | "too-large" | "too-big" | "failed";
}

async function collect(files: FileList): Promise<File[]> {
  const out: File[] = [];
  for (const f of Array.from(files)) {
    if (/\.zip$/i.test(f.name)) {
      const entries = unzipSync(new Uint8Array(await f.arrayBuffer()), { filter: (e) => IMAGE.test(e.name) && !e.name.startsWith("__MACOSX") });
      for (const [name, bytes] of Object.entries(entries)) out.push(new File([bytes as Uint8Array<ArrayBuffer>], name.split("/").pop()!));
    } else if (IMAGE.test(f.name)) {
      out.push(f);
    }
  }
  return out;
}

export function Importer() {
  const [rows, setRows] = useState<Row[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [finished, setFinished] = useState(false);

  // Leaving mid-import stops it; the browser asks first.
  useEffect(() => {
    if (!busy) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy]);

  async function run(list: FileList | null) {
    if (!list?.length || busy) return;
    setBusy(true);
    try {
      await runImport(list);
    } finally {
      setBusy(false);
    }
  }

  async function runImport(list: FileList) {
    setError("");
    setRows([]);
    setFinished(false);
    const all = await collect(list);
    if (all.length === 0) return setError("No JPEG, PNG, WebP or HEIC images found.");
    if (all.length > MAX_FILES) return setError(`Import at most ${MAX_FILES} images at a time; this selection has ${all.length}.`);
    // Oversized files are reported here rather than sent: one would otherwise make its whole batch fail.
    const files = all.filter((f) => f.size <= MAX_BYTES);
    setRows(all.filter((f) => f.size > MAX_BYTES).map((f) => ({ name: f.name, status: "too-big" as const })));
    setProgress({ done: 0, total: files.length });
    for (let i = 0; i < files.length; i += BATCH) {
      const batch = files.slice(i, i + BATCH);
      const form = new FormData();
      batch.forEach((f) => form.append("files", f));
      const res = await fetch("/api/console/imports", { method: "POST", body: form }).catch(() => null);
      const body = await res?.json().catch(() => null);
      if (!res?.ok) {
        setError(body?.error ?? "Import stopped. Check your connection and run it again — imported photos are skipped.");
        setRows((r) => [...r, ...batch.map((f) => ({ name: f.name, status: "failed" as const }))]);
        break;
      }
      setRows((r) => [...r, ...(body.items as Row[])]);
      setProgress({ done: Math.min(i + BATCH, files.length), total: files.length });
      if (i + BATCH >= files.length) setFinished(true);
    }
    if (files.length === 0) setFinished(true);
  }

  const imported = rows.filter((r) => r.status === "imported").length;
  const skipped = rows.length - imported;

  return (
    <div className="flex flex-col gap-4">
      {/* Phones and tablets can't pick a folder: there, images or a .zip is the one action, full width. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <label className="btn-primary cursor-pointer pointer-coarse:hidden has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent">
          Choose a folder
          <input type="file" className="sr-only" aria-label="Choose a folder of images" disabled={busy} {...{ webkitdirectory: "", directory: "" }} multiple onChange={(e) => run(e.target.files)} />
        </label>
        <label className="btn-secondary cursor-pointer pointer-coarse:border-transparent pointer-coarse:bg-accent pointer-coarse:text-accent-fg has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent">
          Choose images or a .zip
          <input type="file" className="sr-only" aria-label="Choose images or a zip file" disabled={busy} multiple accept="image/*,.heic,.heif,.zip" onChange={(e) => run(e.target.files)} />
        </label>
      </div>
      {progress && (
        <div className="flex flex-col gap-1">
          <progress value={progress.done} max={progress.total} className="w-full" aria-label="Import progress" />
          <p role="status" className="text-sm">
            {finished ? "Import complete: " : busy ? "Importing — keep this tab open. " : ""}
            {progress.done} of {progress.total} processed · {imported} imported{skipped ? ` · ${skipped} not imported` : ""}
          </p>
        </div>
      )}
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
      {rows.some((r) => r.status !== "imported") && (
        <details className="text-sm">
          <summary>Not imported</summary>
          <ul className="ml-5 list-disc text-muted">
            {rows
              .filter((r) => r.status !== "imported")
              .map((r, i) => (
                <li key={`${r.name}-${i}`}>
                  {r.name} — {r.status === "unreadable" ? "not a readable image" : r.status === "too-large" ? "over 50 megapixels" : r.status === "too-big" ? "over 20 MB" : "not sent"}
                </li>
              ))}
          </ul>
        </details>
      )}
    </div>
  );
}
