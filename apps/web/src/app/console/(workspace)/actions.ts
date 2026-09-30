"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { REFERENCE_MAX, createClaimFile, replaceClaimLink, revokeClaimLink } from "@/server/dal/claim-files";
import { carrierScope } from "@/server/dal/scope";

export interface CreateClaimState {
  error?: string;
}

export async function createClaim(_: CreateClaimState, form: FormData): Promise<CreateClaimState> {
  const reference = String(form.get("reference") ?? "").trim();
  if (!reference) return { error: "Enter the claim reference." };
  if (reference.length > REFERENCE_MAX) return { error: `Use at most ${REFERENCE_MAX} characters.` };
  const file = await createClaimFile(await carrierScope(), reference);
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
