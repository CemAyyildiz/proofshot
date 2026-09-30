import postgres from "postgres";

/** Must match `TEST_DB_PREFIX` in src/server/test-db.ts (not imported, to keep this setup free of app code). */
const TEST_DB_PREFIX = "ps_test_";

/** Vitest global setup: with TEST_DATABASE_URL, drops the databases a previous or this run created on that server. */
async function dropTestDatabases() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) return;
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  const rows = await sql<{ datname: string }[]>`SELECT datname FROM pg_database WHERE datname LIKE ${`${TEST_DB_PREFIX}%`}`;
  for (const { datname } of rows) await sql.unsafe(`DROP DATABASE IF EXISTS ${datname} WITH (FORCE)`);
  await sql.end();
}

export async function setup() {
  await dropTestDatabases();
}

export async function teardown() {
  await dropTestDatabases();
}
