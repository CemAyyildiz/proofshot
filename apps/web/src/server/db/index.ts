import "server-only";
import { env } from "@/lib/env";
import { processSingleton } from "../singleton";
import { DEFAULT_DEV_DATABASE_URL, openDb, type Db } from "./client";

export * from "./client";
export * as schema from "./schema";

/** Process-wide database handle. Falls back to an embedded PGlite outside production. */
export function getDb(): Promise<Db> {
  return processSingleton("db", () => {
    const url = env().DATABASE_URL ?? (process.env.NODE_ENV === "production" ? undefined : DEFAULT_DEV_DATABASE_URL);
    if (!url) throw new Error("DATABASE_URL is required in production");
    return openDb(url);
  });
}
