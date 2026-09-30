/**
 * pnpm report:latency [--since YYYY-MM-DD] [--out <file>] — SM-5 seal-latency report from DATABASE_URL.
 * Writes docs/latency.md at the repo root by default; the submission write-up quotes its p95.
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { DEFAULT_DEV_DATABASE_URL, openDb } from "../src/server/db/client";
import { latencyMarkdown, latencyReport } from "../src/server/reports/latency";

const { values } = parseArgs({ options: { since: { type: "string" }, out: { type: "string" } } });
const since = values.since ? new Date(values.since) : null;
if (since && Number.isNaN(since.getTime())) throw new Error(`--since must be a date, got ${values.since}`);
const out = resolve(process.env.INIT_CWD ?? process.cwd(), values.out ?? resolve(import.meta.dirname, "../../../docs/latency.md"));

const db = await openDb(process.env.DATABASE_URL || DEFAULT_DEV_DATABASE_URL);
const md = latencyMarkdown(await latencyReport(db, since), { network: process.env.PROOFSHOT_NETWORK ?? "local", generatedAt: new Date() });
writeFileSync(out, md);
console.log(md);
console.log(`wrote ${out}`);
process.exit();
