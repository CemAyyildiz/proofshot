import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Db } from "./client";
import { carriers, users } from "./schema";

export const SEED_CARRIERS = [
  { slug: "northwind", name: "Northwind Mutual", isSandbox: false, users: ["marcus@northwind.demo"] },
  { slug: "harbor", name: "Harbor Insurance", isSandbox: false, users: ["dana@harbor.demo"] },
  { slug: "sandbox", name: "Proofshot Sandbox", isSandbox: true, users: [] },
] as const;

export const randomBytes32 = () => `0x${randomBytes(32).toString("hex")}`;

/**
 * Idempotent: existing Carriers keep their id and pseudonymous ID, because sealed Capture Records
 * reference the pseudonymous ID onchain forever. Extra users can be added via `extraUsers`.
 */
export async function seed(db: Db, extraUsers: Partial<Record<string, string[]>> = {}) {
  for (const c of SEED_CARRIERS) {
    await db
      .insert(carriers)
      .values({ slug: c.slug, name: c.name, isSandbox: c.isSandbox, pseudonymousId: randomBytes32() })
      .onConflictDoNothing({ target: carriers.slug });
    const [row] = await db.select().from(carriers).where(eq(carriers.slug, c.slug));
    for (const email of [...c.users, ...(extraUsers[c.slug] ?? [])]) {
      await db.insert(users).values({ carrierId: row!.id, email: email.toLowerCase() }).onConflictDoNothing({ target: users.email });
    }
  }
}
