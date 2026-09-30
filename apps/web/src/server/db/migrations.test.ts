import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { join, relative } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { MIGRATIONS_DIR } from "./client";

// drizzle-kit only accepts an output path relative to the working directory.
const cacheDir = join(process.cwd(), "node_modules/.cache");
mkdirSync(cacheDir, { recursive: true });
const out = mkdtempSync(join(cacheDir, "migration-drift-"));
afterAll(() => rmSync(out, { recursive: true, force: true }));

describe("migrations", () => {
  // Tests run on the migrations, not on schema.ts, so an index or constraint added to the schema without
  // `pnpm db:generate` would pass every test and never reach a real database.
  it("match schema.ts: generating from the committed migrations produces nothing new", () => {
    cpSync(MIGRATIONS_DIR, out, { recursive: true });
    const before = readdirSync(out).length;
    const log = execFileSync(
      join(process.cwd(), "node_modules/.bin/drizzle-kit"),
      ["generate", "--dialect", "postgresql", "--schema", "./src/server/db/schema.ts", "--out", relative(process.cwd(), out)],
      { encoding: "utf8" },
    );
    expect(readdirSync(out), `schema.ts has changes without a migration; run \`pnpm db:generate\`\n${log}`).toHaveLength(before);
  });
});
