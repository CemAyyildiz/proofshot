import { openDb, type Db } from "./db/client";
import { seed } from "./db/seed";

/** Fresh in-memory Postgres with migrations and seed applied. */
export async function testDb(): Promise<Db> {
  const db = await openDb("pglite:memory");
  await seed(db);
  return db;
}
