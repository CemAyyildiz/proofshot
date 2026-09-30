import { PGlite } from "@electric-sql/pglite";
import type { Hex32 } from "@proofshot/fingerprint";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import type { Db } from "./db/client";
import { MIGRATIONS_DIR, openDb } from "./db/client";
import * as schema from "./db/schema";
import { carriers, users } from "./db/schema";
import { seed } from "./db/seed";

/**
 * Set `TEST_DATABASE_URL=postgres://…/postgres` to run every database test against a real Postgres server through
 * the production driver (postgres-js, a connection pool) instead of the embedded PGlite. CI does this in its own job.
 */
const SERVER_URL = process.env.TEST_DATABASE_URL;
/** Prefix of every database this suite creates on that server; `test-db-setup.ts` drops them before and after. */
export const TEST_DB_PREFIX = "ps_test_";

let template: Promise<Blob | string> | undefined;
let created = 0;

/** Migrated + seeded data (a PGlite data dir, or a Postgres template database), built once per test worker. */
function seededTemplate(): Promise<Blob | string> {
  template ??= (async () => {
    if (SERVER_URL) {
      const name = `${TEST_DB_PREFIX}tpl_${process.pid}`;
      const admin = postgres(SERVER_URL, { max: 1, onnotice: () => {} });
      await admin.unsafe(`DROP DATABASE IF EXISTS ${name}`);
      await admin.unsafe(`CREATE DATABASE ${name}`);
      await admin.end();
      const client = postgres(withDatabase(SERVER_URL, name), { max: 1, onnotice: () => {} });
      const db = drizzlePostgres(client, { schema }) as unknown as Db;
      await migrate(db as never, { migrationsFolder: MIGRATIONS_DIR });
      await seed(db);
      await client.end(); // a template must have no open connections
      return name;
    }
    const db = await openDb("pglite:memory");
    await seed(db);
    return ((db as unknown as { $client: PGlite }).$client).dumpDataDir("none");
  })();
  return template;
}

function withDatabase(url: string, name: string): string {
  const u = new URL(url);
  u.pathname = `/${name}`;
  return u.toString();
}

/** Fresh, isolated Postgres with migrations and seed applied. */
export async function testDb(): Promise<Db> {
  const tpl = await seededTemplate();
  if (typeof tpl === "string") {
    const name = `${TEST_DB_PREFIX}${process.pid}_${++created}`;
    const admin = postgres(SERVER_URL!, { max: 1, onnotice: () => {} });
    await admin.unsafe(`CREATE DATABASE ${name} TEMPLATE ${tpl}`);
    await admin.end();
    // The production pool size, so concurrent queries really run concurrently; idle connections close on their own
    // because tests never close their database.
    return drizzlePostgres(postgres(withDatabase(SERVER_URL!, name), { max: 5, prepare: false, idle_timeout: 1 }), { schema }) as unknown as Db;
  }
  const client = new PGlite({ loadDataDir: tpl });
  return drizzle(client, { schema }) as unknown as Db;
}

/** A seeded Carrier's scope (as a signed-in member would have it) plus its pseudonymous onchain ID. */
export async function carrierScope(db: Db, slug: "northwind" | "harbor" | "sandbox") {
  const [c] = await db.select().from(carriers).where(eq(carriers.slug, slug));
  const [u] = await db.select().from(users).where(eq(users.carrierId, c!.id));
  return { db, carrierId: c!.id, userId: u?.id, pid: c!.pseudonymousId as Hex32 };
}
