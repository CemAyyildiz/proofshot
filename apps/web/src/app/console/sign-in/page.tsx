import type { Metadata } from "next";
import Link from "next/link";
import { Wordmark } from "@/components/brand/logo";
import { redirect } from "next/navigation";
import { enterDemo } from "@/app/auth/actions";
import { env } from "@/lib/env";
import { getSession } from "@/server/auth/session";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in · Proofshot Console" };

export default async function SignInPage({ searchParams }: PageProps<"/console/sign-in">) {
  if (await getSession()) redirect("/console");
  const demo = env().DEMO_ACCESS === "1";
  const { demo: demoState } = await searchParams;
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-16">
      <Link href="/" aria-label="Proofshot home" className="self-start">
        <Wordmark />
      </Link>
      <div>
        <p className="eyebrow">Carrier Console</p>
        <h1 className="display mt-1 text-3xl sm:text-4xl">Sign in</h1>
      </div>
      <SignInForm />
      {demo && (
        <section aria-labelledby="demo-heading" className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
          <h2 id="demo-heading" className="font-semibold">
            Explore the demo Console
          </h2>
          <p className="text-sm text-muted">
            No email needed. Two demo carriers share one registry, so you can see a Duplicate Alert across carriers. Demo
            data is shared with other visitors.
          </p>
          {demoState === "limited" && (
            <p role="alert" className="text-sm text-danger">
              Too many demo sessions from this network. Try again later.
            </p>
          )}
          <form action={enterDemo} className="flex flex-col gap-2 sm:flex-row">
            <button type="submit" name="carrier" value="northwind" className="btn-secondary flex-1">
              Northwind Mutual <span className="font-normal text-muted">· adjuster</span>
            </button>
            <button type="submit" name="carrier" value="harbor" className="btn-secondary flex-1">
              Harbor Insurance <span className="font-normal text-muted">· investigator</span>
            </button>
          </form>
        </section>
      )}
    </main>
  );
}
