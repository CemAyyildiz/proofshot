"use client";

import { unzipSync } from "fflate";
import { useState } from "react";

const MAX_FILES = 500;
const BATCH = 10;
const IMAGE = /\.(jpe?g|png|webp|heic|heif)$/i;

interface Row {
  name: string;
  status: "imported" | "unreadable" | "failed";
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

  async function run(list: FileList | null) {
    if (!list?.length) return;
    setError("");
    setRows([]);
    const files = await collect(list);
    if (files.length === 0) return setError("No JPEG, PNG, WebP or HEIC images found.");
    if (files.length > MAX_FILES) return setError(`Import at most ${MAX_FILES} images at a time; this selection has ${files.length}.`);
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
    }
  }

  const imported = rows.filter((r) => r.status === "imported").length;
  const skipped = rows.length - imported;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-3">
        <label className="btn-primary cursor-pointer">
          Choose a folder
          <input type="file" className="sr-only" aria-label="Choose a folder of images" {...{ webkitdirectory: "", directory: "" }} multiple onChange={(e) => run(e.target.files)} />
        </label>
        <label className="cursor-pointer rounded-md border border-line px-4 py-2.5 font-medium">
          Choose images or a .zip
          <input type="file" className="sr-only" aria-label="Choose images or a zip file" multiple accept="image/*,.heic,.heif,.zip" onChange={(e) => run(e.target.files)} />
        </label>
      </div>
      {progress && (
        <div className="flex flex-col gap-1">
          <progress value={progress.done} max={progress.total} className="w-full" aria-label="Import progress" />
          <p role="status" className="text-sm">
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
                  {r.name} — {r.status === "unreadable" ? "not a readable image" : "not sent"}
                </li>
              ))}
          </ul>
        </details>
      )}
    </div>
  );
}
