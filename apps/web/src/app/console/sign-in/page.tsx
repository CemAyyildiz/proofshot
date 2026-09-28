import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/server/auth/session";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in · Proofshot Console" };

export default async function SignInPage() {
  if (await getSession()) redirect("/console");
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-16">
      <div>
        <p className="eyebrow">Carrier Console</p>
        <h1 className="mt-1 text-2xl font-semibold">Sign in</h1>
      </div>
      <SignInForm />
    </main>
  );
}
