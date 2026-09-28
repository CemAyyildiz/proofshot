import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Schema = typeof schema;
export type Db = PgDatabase<PgQueryResultHKT, Schema>;

/** Resolved from the app root (cwd for `next dev`, tests and scripts); bundling would break a module-relative path. */
export const MIGRATIONS_DIR = join(process.cwd(), "src/server/db/migrations");
export const DEFAULT_DEV_DATABASE_URL = "pglite:./.data/pglite";

/**
 * `pglite:<dir>` or `pglite:memory` runs an embedded Postgres (dev, tests, CI) and applies migrations on open.
 * Any `postgres://` URL uses postgres-js; migrations there run via `pnpm db:migrate` at deploy time.
 */
export async function openDb(url: string): Promise<Db> {
  if (url.startsWith("pglite:")) {
    const target = url.slice("pglite:".length);
    if (target !== "memory") mkdirSync(dirname(target), { recursive: true });
    const client = new PGlite(target === "memory" ? undefined : target);
    const db = drizzlePglite(client, { schema });
    await migratePglite(db, { migrationsFolder: MIGRATIONS_DIR });
    return db as unknown as Db;
  }
  return drizzlePostgres(postgres(url, { max: 5, prepare: false }), { schema }) as unknown as Db;
}
