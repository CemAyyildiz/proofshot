import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, normalize } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every repository path the README and docs point at must be committed. A file that exists locally but is git-ignored
 * (apps/web/.env.example once was) looks fine on the author's machine and is missing from every clone.
 */
const root = new URL("../../../", import.meta.url).pathname;
const tracked = execFileSync("git", ["ls-files"], { cwd: root }).toString().split("\n").filter(Boolean);
const trackedSet = new Set(tracked);
const exists = (p: string) => trackedSet.has(p) || tracked.some((t) => t.startsWith(`${p.replace(/\/$/, "")}/`));

/** Paths the docs name on purpose that are produced later, by a run, a deploy or the app itself. */
const PRODUCED_LATER: Record<string, string> = {
  "apps/web/.data/outbox.jsonl": "dev mail outbox, written at runtime",
  "docs/latency.md": "written by `pnpm --filter web report:latency` after real Seals",
  "docs/spikes/spike-b-testnet.json": "written by the funded testnet run",
  "benchmark/README.md": "written by the real-photo benchmark run",
};

const docs = ["README.md", ...tracked.filter((f) => f.startsWith("docs/") && f.endsWith(".md") && !f.includes("REVIEW-LOG"))];

function references(doc: string): string[] {
  const text = readFileSync(`${root}${doc}`, "utf8");
  const code = [...text.matchAll(/`((?:apps|packages|contracts|cli|benchmark|docs|\.github)\/[^`\s]*)`/g)].map((m) => m[1]!);
  // Relative Markdown links resolve against the document's own directory.
  const links = [...text.matchAll(/\]\(([^)#\s]+)\)/g)]
    .map((m) => m[1]!)
    .filter((l) => !/^[a-z]+:/i.test(l))
    .map((l) => normalize(`${dirname(doc)}/${l}`));
  return [...code, ...links].map((p) => p.replace(/[.,;:]+$/, "")).filter((p) => !/[<>*…{}]/.test(p));
}

describe("docs reference only committed files", () => {
  it.each(docs)("%s", (doc) => {
    const missing = references(doc).filter((p) => !exists(p) && !(p in PRODUCED_LATER));
    expect(missing).toEqual([]);
  });

  it("names only test files that exist (a renamed test must not leave the traceability table pointing nowhere)", () => {
    const basenames = new Set(tracked.map((t) => t.slice(t.lastIndexOf("/") + 1)));
    const named = docs.flatMap((d) => [...readFileSync(`${root}${d}`, "utf8").matchAll(/`([\w.-]+\.(?:test\.ts|spec\.ts|t\.sol))`/g)].map((m) => m[1]!));
    expect(named.length).toBeGreaterThan(15);
    expect(named.filter((n) => !basenames.has(n))).toEqual([]);
  });

  it("the produced-later allow-list has no stale entries", () => {
    const named = new Set(docs.flatMap(references));
    expect(Object.keys(PRODUCED_LATER).filter((p) => !named.has(p) || exists(p))).toEqual([]);
  });
});
