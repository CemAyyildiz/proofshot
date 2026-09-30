import Link from "next/link";
import { LogoMark } from "@/components/brand/logo";
import { signOut } from "@/app/auth/actions";
import { requireSession } from "@/server/auth/session";
import { DEMO_RETENTION_DAYS } from "@/server/maintenance";
import { ConsoleNav } from "./console-nav";

export default async function WorkspaceLayout({ children }: LayoutProps<"/console">) {
  const session = await requireSession();
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-x-6 gap-y-1 px-4 py-1.5">
          <div className="flex flex-wrap items-center gap-x-5">
            <Link href="/console" className="inline-flex min-h-11 items-center gap-2 font-semibold">
              <LogoMark /> Proofshot <span className="font-normal text-muted">· {session.carrierName}</span>
            </Link>
            <ConsoleNav />
          </div>
          <form action={signOut} className="flex items-center gap-3 text-sm">
            <span className="hidden text-muted sm:inline">{session.email}</span>
            <button type="submit" className="inline-flex min-h-11 items-center underline underline-offset-4">
              Sign out
            </button>
          </form>
        </div>
      </header>
      {session.isDemo && (
        <p className="border-b border-line bg-background px-4 py-2 text-center text-sm text-muted">
          Demo workspace · {session.carrierName} is a fictional carrier. Anything you add here is visible to other visitors and removed after {DEMO_RETENTION_DAYS} days.
        </p>
      )}
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}
