"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export function UploadForm({ claimFileId }: { claimFileId: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<{ busy: boolean; error?: string }>({ busy: false });

  // A file picked before hydration fires no onChange; process it once the form is interactive.
  useEffect(() => {
    const early = input.current?.files?.[0];
    if (early) void upload(early);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on mount
  }, []);

  async function upload(file: File) {
    setState({ busy: true });
    const form = new FormData();
    form.set("file", file);
    const res = await fetch(`/api/console/claims/${claimFileId}/uploads`, { method: "POST", body: form }).catch(() => null);
    if (!res?.ok) {
      const body = await res?.json().catch(() => ({}));
      setState({ busy: false, error: body?.error ?? "Upload failed. Try again." });
    } else {
      setState({ busy: false });
      router.refresh();
    }
    if (input.current) input.current.value = "";
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="flex flex-wrap items-center gap-3 rounded-xl has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent">
        <span className="text-sm text-muted">Received a photo by email or another channel?</span>
        <span className="rounded-xl border border-line bg-surface px-3 py-2 text-sm font-medium hover:border-foreground/40">{state.busy ? "Verifying…" : "Upload and verify"}</span>
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
          className="sr-only"
          aria-label="Upload an image to verify in this Claim File"
          disabled={state.busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
          }}
        />
      </label>
      {state.error && (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}
    </div>
  );
}
