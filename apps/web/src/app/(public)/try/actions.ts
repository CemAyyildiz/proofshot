"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/server/db";
import { clientKey } from "@/server/client-key";
import { startSandbox } from "@/server/sandbox";

export async function startDemo(): Promise<{ error: string }> {
  const result = await startSandbox(await getDb(), clientKey(await headers()));
  if (!result.ok) return { error: result.error };
  redirect(`/c/${result.token}`);
}
