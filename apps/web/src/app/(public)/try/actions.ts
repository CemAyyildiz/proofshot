"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/server/db";
import { startSandbox } from "@/server/sandbox";

export async function startDemo(): Promise<{ error: string }> {
  const h = await headers();
  const visitor = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  const result = await startSandbox(await getDb(), visitor);
  if (!result.ok) return { error: result.error };
  redirect(`/c/${result.token}`);
}
