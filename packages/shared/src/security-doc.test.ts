import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** docs/security.md names the test behind every contract guarantee; a renamed or deleted test must break this. */
const root = new URL("../../../", import.meta.url).pathname;

function solidityFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? solidityFiles(join(dir, e.name)) : e.name.endsWith(".sol") ? [join(dir, e.name)] : []));
}

describe("docs/security.md", () => {
  it("cites only contract tests that exist", () => {
    const doc = readFileSync(`${root}docs/security.md`, "utf8");
    const cited = [...new Set([...doc.matchAll(/`((?:test|testFuzz|invariant)_[A-Za-z0-9_]+)`/g)].map((m) => m[1]!))];
    const source = solidityFiles(`${root}contracts/test`).map((f) => readFileSync(f, "utf8")).join("\n");
    expect(cited.length).toBeGreaterThan(20);
    expect(cited.filter((name) => !source.includes(`function ${name}(`))).toEqual([]);
  });
});
