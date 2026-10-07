"use client";

import { useState } from "react";
import { type DemoSample, loadDemoSample } from "@/lib/demo-samples";

/**
 * Sample images offered as one-tap choices, for trying a check without a photo at hand. Each button says what the
 * file is, not which Verdict it gets: the point is to watch the check decide.
 */
export function SamplePicker({
  samples,
  onPick,
  disabled = false,
  compact = false,
}: {
  samples: DemoSample[];
  onPick: (file: File) => void;
  disabled?: boolean;
  /** One row of small buttons (Console) instead of cards (Public Verifier). */
  compact?: boolean;
}) {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState(false);
  if (samples.length === 0) return null;

  async function pick(sample: DemoSample) {
    setLoading(sample.id);
    setError(false);
    try {
      onPick(await loadDemoSample(sample));
    } catch {
      setError(true);
    } finally {
      setLoading(null);
    }
  }

  return (
    <>
      <ul className={compact ? "flex flex-wrap gap-2" : "grid grid-cols-2 gap-3 sm:grid-cols-4"}>
        {samples.map((s) => (
          <li key={s.id} className={compact ? undefined : "flex"}>
            <button
              type="button"
              disabled={disabled || loading !== null}
              onClick={() => void pick(s)}
              className={
                compact
                  ? "inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-surface py-1 pl-1 pr-4 text-sm font-medium hover:border-foreground/40 disabled:opacity-50"
                  : "card flex w-full flex-col overflow-hidden text-left hover:border-foreground/40 disabled:opacity-50"
              }
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- small static thumbnails shipped with the app */}
              <img src={s.thumb} alt="" loading="lazy" className={compact ? "size-9 rounded-full object-cover" : "aspect-[4/3] w-full object-cover"} />
              {compact ? (
                <span>{loading === s.id ? "Loading…" : s.label}</span>
              ) : (
                <span className="flex flex-col gap-0.5 p-3">
                  <span className="font-semibold leading-snug">{loading === s.id ? "Loading…" : s.label}</span>
                  <span className="text-sm text-muted">{s.detail}</span>
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="text-sm text-danger">
          The sample could not be loaded. Check your connection and try again.
        </p>
      )}
    </>
  );
}
