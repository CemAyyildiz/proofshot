/**
 * pnpm db:migrate — apply migrations to DATABASE_URL (Postgres) or the dev PGlite.
 * pnpm db:seed [carrier-slug=email ...] — idempotent seed, e.g. `pnpm db:seed northwind=me@example.com`.
 */
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { DEFAULT_DEV_DATABASE_URL, MIGRATIONS_DIR, openDb } from "../src/server/db/client";
import { seed } from "../src/server/db/seed";

const [cmd, ...args] = process.argv.slice(2);
const url = process.env.DATABASE_URL || DEFAULT_DEV_DATABASE_URL;
const db = await openDb(url); // PGlite migrates on open

if (cmd === "migrate") {
  if (!url.startsWith("pglite:")) await migrate(db as never, { migrationsFolder: MIGRATIONS_DIR });
  console.log(`migrated ${url.replace(/\/\/.*@/, "//***@")}`);
} else if (cmd === "seed") {
  const extra: Record<string, string[]> = {};
  for (const a of args) {
    const [slug, email] = a.split("=");
    if (slug && email) (extra[slug] ??= []).push(email);
  }
  await seed(db, extra);
  console.log("seeded");
} else {
  console.error("usage: db.mts migrate | seed [slug=email ...]");
  process.exitCode = 1;
}
process.exit();
