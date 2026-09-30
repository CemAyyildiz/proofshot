"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { env } from "@/lib/env";
import { requireSession } from "@/server/auth/session";
import { clientKey } from "@/server/client-key";
import { REFERENCE_MAX, createClaimFile, mayCreateClaimFile, replaceClaimLink, revokeClaimLink } from "@/server/dal/claim-files";
import { carrierScope } from "@/server/dal/scope";

export interface CreateClaimState {
  error?: string;
}

export async function createClaim(_: CreateClaimState, form: FormData): Promise<CreateClaimState> {
  const reference = String(form.get("reference") ?? "").trim();
  if (!reference) return { error: "Enter the claim reference." };
  if (reference.length > REFERENCE_MAX) return { error: `Use at most ${REFERENCE_MAX} characters.` };
  const [session, scope] = await Promise.all([requireSession(), carrierScope()]);
  const visitor = { key: clientKey(await headers()), limit: env().DEMO_CLAIM_FILES_PER_VISITOR };
  if (!(await mayCreateClaimFile(scope.db, session, visitor))) {
    return { error: "You've reached today's limit for new Claim Files. Try again tomorrow." };
  }
  const file = await createClaimFile(scope, reference);
  revalidatePath("/console");
  redirect(`/console/claims/${file.id}`);
}

export async function revokeLink(form: FormData) {
  const id = String(form.get("claimFileId") ?? "");
  await revokeClaimLink(await carrierScope(), id);
  revalidatePath(`/console/claims/${id}`);
  revalidatePath("/console");
  redirect(`/console/claims/${id}?link=revoked`); // the page confirms it and offers the next step
}

export async function replaceLink(form: FormData) {
  const id = String(form.get("claimFileId") ?? "");
  await replaceClaimLink(await carrierScope(), id);
  revalidatePath(`/console/claims/${id}`);
  revalidatePath("/console");
  redirect(`/console/claims/${id}?link=new`); // the page says the link changed and focuses "Copy link"
}
