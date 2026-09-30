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
        {/* Phones: brand and Sign out on one row, the tabs under them. Wider: one row. */}
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-5 px-4 pt-1.5 sm:py-1.5">
          <Link href="/console" className="order-1 inline-flex min-h-11 min-w-0 items-center gap-2 font-semibold">
            <LogoMark /> Proofshot <span className="truncate font-normal text-muted">· {session.carrierName}</span>
          </Link>
          <div className="order-3 -mx-2.5 w-[calc(100%+1.25rem)] sm:order-2 sm:mx-0 sm:w-auto">
            <ConsoleNav />
          </div>
          <form action={signOut} className="order-2 ml-auto flex items-center gap-3 text-sm sm:order-3">
            <span className="hidden text-muted sm:inline">{session.email}</span>
            <button type="submit" className="inline-flex min-h-11 items-center underline underline-offset-4">
              Sign out
            </button>
          </form>
        </div>
      </header>
      {session.isDemo && (
        <p className="border-b border-line bg-background px-4 py-2 text-center text-xs text-muted sm:text-sm">
          <span className="sm:hidden">Shared demo workspace · cleared after {DEMO_RETENTION_DAYS} days</span>
          <span className="hidden sm:inline">
            Demo workspace · {session.carrierName} is a fictional carrier. Anything you add here is visible to other visitors and removed after {DEMO_RETENTION_DAYS} days.
          </span>
        </p>
      )}
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}
