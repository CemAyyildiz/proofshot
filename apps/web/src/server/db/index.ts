import "server-only";
import { env } from "@/lib/env";
import { DEFAULT_DEV_DATABASE_URL, openDb, type Db } from "./client";

export * from "./client";
export * as schema from "./schema";

let db: Promise<Db> | undefined;

/** Process-wide database handle. Falls back to an embedded PGlite outside production. */
export function getDb(): Promise<Db> {
  if (!db) {
    const url = env().DATABASE_URL ?? (process.env.NODE_ENV === "production" ? undefined : DEFAULT_DEV_DATABASE_URL);
    if (!url) throw new Error("DATABASE_URL is required in production");
    db = openDb(url);
  }
  return db;
}
