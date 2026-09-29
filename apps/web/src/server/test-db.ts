import { PGlite } from "@electric-sql/pglite";
import type { Hex32 } from "@proofshot/fingerprint";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import type { Db } from "./db/client";
import { openDb } from "./db/client";
import * as schema from "./db/schema";
import { carriers, users } from "./db/schema";
import { seed } from "./db/seed";

let template: Promise<Blob> | undefined;

/** Migrated + seeded data dir, built once per test worker. Cloning it is much cheaper than re-migrating. */
function seededTemplate(): Promise<Blob> {
  template ??= (async () => {
    const db = await openDb("pglite:memory");
    await seed(db);
    return ((db as unknown as { $client: PGlite }).$client).dumpDataDir("none");
  })();
  return template;
}

/** Fresh, isolated in-memory Postgres with migrations and seed applied. */
export async function testDb(): Promise<Db> {
  const client = new PGlite({ loadDataDir: await seededTemplate() });
  return drizzle(client, { schema }) as unknown as Db;
}

/** A seeded Carrier's scope (as a signed-in member would have it) plus its pseudonymous onchain ID. */
export async function carrierScope(db: Db, slug: "northwind" | "harbor" | "sandbox") {
  const [c] = await db.select().from(carriers).where(eq(carriers.slug, slug));
  const [u] = await db.select().from(users).where(eq(users.carrierId, c!.id));
  return { db, carrierId: c!.id, userId: u?.id, pid: c!.pseudonymousId as Hex32 };
}
