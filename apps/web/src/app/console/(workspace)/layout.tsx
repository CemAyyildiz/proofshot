import Link from "next/link";
import { signOut } from "@/app/auth/actions";
import { requireSession } from "@/server/auth/session";

export default async function WorkspaceLayout({ children }: LayoutProps<"/console">) {
  const session = await requireSession();
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <nav className="flex items-center gap-5">
            <Link href="/console" className="font-semibold">
              Proofshot <span className="font-normal text-muted">· {session.carrierName}</span>
            </Link>
            <Link href="/console/imports" className="text-sm text-muted underline-offset-4 hover:underline">
              Import history
            </Link>
          </nav>
          <form action={signOut} className="flex items-center gap-3 text-sm">
            <span className="hidden text-muted sm:inline">{session.email}</span>
            <button type="submit" className="underline underline-offset-4">
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}
