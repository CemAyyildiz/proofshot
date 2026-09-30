import { and, eq, gte, isNotNull } from "drizzle-orm";
import type { Db } from "../db/client";
import { captures, carriers, claimFiles } from "../db/schema";

/** SM-5 / NFR-1: shutter → "Sealed" as measured on the Capturer's device and posted with each Seal. */
export interface LatencyStats {
  n: number;
  p50: number;
  p95: number;
  max: number;
}

export interface LatencyReport {
  /** Shutter → onchain Seal confirmed ("Sealed"). */
  sealed: { all: LatencyStats | null; claimLinks: LatencyStats | null; tryIt: LatencyStats | null };
  /** Shutter → passkey signature done (the part the Capturer's own device controls). */
  signed: LatencyStats | null;
  since: Date | null;
}

/** Nearest-rank percentile: the smallest value with at least p of the samples at or below it. */
export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) throw new Error("no samples");
  return sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)]!;
}

export function stats(values: number[]): LatencyStats | null {
  const v = values.filter((x) => Number.isFinite(x) && x >= 0).sort((a, b) => a - b);
  if (v.length === 0) return null;
  return { n: v.length, p50: percentile(v, 0.5), p95: percentile(v, 0.95), max: v[v.length - 1]! };
}

export async function latencyReport(db: Db, since: Date | null = null): Promise<LatencyReport> {
  const rows = await db
    .select({ timings: captures.timings, isSandbox: carriers.isSandbox })
    .from(captures)
    .innerJoin(claimFiles, eq(claimFiles.id, captures.claimFileId))
    .innerJoin(carriers, eq(carriers.id, claimFiles.carrierId))
    .where(and(isNotNull(captures.timings), since ? gte(captures.sealedAt, since) : undefined));
  const sealed = (keep: (sandbox: boolean) => boolean) =>
    stats(rows.filter((r) => keep(r.isSandbox)).flatMap((r) => (r.timings?.shutterToSealedMs === undefined ? [] : [r.timings.shutterToSealedMs])));
  return {
    sealed: { all: sealed(() => true), claimLinks: sealed((s) => !s), tryIt: sealed((s) => s) },
    signed: stats(rows.flatMap((r) => (r.timings?.shutterToSignedMs === undefined ? [] : [r.timings.shutterToSignedMs]))),
    since,
  };
}

const s = (ms: number) => `${(ms / 1000).toFixed(2)} s`;
const row = (label: string, st: LatencyStats | null) =>
  st ? `| ${label} | ${st.n} | ${s(st.p50)} | **${s(st.p95)}** | ${s(st.max)} |` : `| ${label} | 0 | — | — | — |`;

export function latencyMarkdown(r: LatencyReport, meta: { network: string; generatedAt: Date }): string {
  const target = r.sealed.all ? (r.sealed.all.p95 <= 3000 ? "met" : "**not met**") : "no data";
  return [
    "# Seal latency (SM-5, NFR-1)",
    "",
    `Generated ${meta.generatedAt.toISOString()} from the ${meta.network} deployment's database` +
      (r.since ? `, Seals since ${r.since.toISOString()}.` : ", all Seals."),
    "Each Seal's timings are measured on the Capturer's device and posted with the Seal. Percentiles are nearest-rank.",
    "",
    "| Shutter → \"Sealed\" | Seals | p50 | p95 | max |",
    "|---|---|---|---|---|",
    row("All", r.sealed.all),
    row("Claim Links", r.sealed.claimLinks),
    row("Try-it sandbox", r.sealed.tryIt),
    "",
    `Shutter → passkey signature (on-device part): ${r.signed ? `p50 ${s(r.signed.p50)}, p95 ${s(r.signed.p95)} over ${r.signed.n}` : "no data"}.`,
    "",
    `Target p95 ≤ 3 s: ${target}.`,
    "",
    "Regenerate: `DATABASE_URL=… PROOFSHOT_NETWORK=mainnet pnpm --filter web report:latency [--since YYYY-MM-DD]`.",
    "",
  ].join("\n");
}
