import type { Metadata } from "next";
import Link from "next/link";
import { WarningIcon } from "@/components/icons";
import { formatDate } from "@/lib/format";
import { claimLinkState, listClaimFiles } from "@/server/dal/claim-files";
import { carrierScope } from "@/server/dal/scope";
import { CreateClaimForm } from "./create-claim-form";

export const metadata: Metadata = { title: "Claim Files · Proofshot Console" };

const STATUS_LABEL = { awaiting_evidence: "Awaiting evidence", evidence_received: "Evidence received" } as const;
const LINK_LABEL = { active: "Active", revoked: "Revoked", expired: "Expired" } as const;
const PAGE_SIZE = 50;

export default async function ConsoleHome({ searchParams }: PageProps<"/console">) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim().slice(0, 100) : "";
  const page = Math.max(1, Number.parseInt(typeof params.page === "string" ? params.page : "1", 10) || 1);
  // One extra row tells us whether an older page exists without counting the whole table.
  const rows = await listClaimFiles(await carrierScope(), { q, limit: PAGE_SIZE + 1, offset: (page - 1) * PAGE_SIZE });
  const files = rows.slice(0, PAGE_SIZE);
  const hasOlder = rows.length > PAGE_SIZE;
  const pageHref = (n: number) => `/console?${new URLSearchParams({ ...(q ? { q } : {}), ...(n > 1 ? { page: String(n) } : {}) })}`;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Claim Files</h1>
        <p className="text-sm text-muted">Create a Claim File to get a link the policyholder uses to send sealed photos.</p>
      </div>
      <CreateClaimForm />
      {(files.length > 0 || q || page > 1) && (
        <form role="search" action="/console" className="flex flex-wrap items-end gap-2">
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm sm:max-w-sm">
            <span className="font-medium">Find a Claim File</span>
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Claim reference"
              className="min-h-11 rounded-md border border-line bg-surface px-3 py-2"
            />
          </label>
          <button type="submit" className="btn-secondary">
            Search
          </button>
          {q && (
            <Link href="/console" className="inline-flex min-h-11 items-center text-sm underline underline-offset-4">
              Clear
            </Link>
          )}
        </form>
      )}
      {files.length === 0 && (q || page > 1) ? (
        <p className="rounded-md border border-dashed border-line p-8 text-center text-muted">
          {q ? <>No Claim Files match &ldquo;{q}&rdquo;.</> : "No more Claim Files."}
        </p>
      ) : files.length === 0 ? (
        <div className="rounded-md border border-dashed border-line p-8 text-center text-muted">
          No Claim Files yet. Create one above to get a Claim Link for the policyholder.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border border-line bg-surface">
          <table className="w-full min-w-[40rem] text-sm">
            <caption className="sr-only">{q ? `Claim Files matching “${q}”, newest first` : "Claim Files, newest first"}</caption>
            <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-medium">Reference</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">Items</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Alerts</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Claim Link</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {files.map((f) => {
                const link = claimLinkState(f.link);
                return (
                  <tr key={f.id} className="hover:bg-background">
                    <th scope="row" className="max-w-[18rem] px-4 py-3 text-left font-medium">
                      <Link href={`/console/claims/${f.id}`} title={f.reference} className="block truncate hover:underline">
                        {f.reference}
                      </Link>
                    </th>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${
                          f.status === "evidence_received" ? "border-foreground/30 text-foreground" : "border-line text-muted"
                        }`}
                      >
                        {STATUS_LABEL[f.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{f.items}</td>
                    <td className="px-4 py-3">
                      {f.alerts > 0 ? (
                        <span className="inline-flex items-center gap-1.5 font-semibold">
                          <WarningIcon /> {f.alerts} duplicate{f.alerts === 1 ? "" : "s"}
                        </span>
                      ) : (
                        <span className="text-muted">None</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 text-sm ${link === "active" ? "" : "text-muted"}`}>
                        <span aria-hidden="true" className={`size-1.5 rounded-full ${link === "active" ? "bg-foreground" : "bg-line"}`} />
                        {LINK_LABEL[link]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted tabular-nums">{formatDate(f.createdAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {(page > 1 || hasOlder) && (
        <nav aria-label="Claim File pages" className="flex items-center justify-between text-sm">
          {page > 1 ? (
            <Link href={pageHref(page - 1)} className="btn-secondary">
              Newer
            </Link>
          ) : (
            <span />
          )}
          <span className="text-muted">Page {page}</span>
          {hasOlder ? (
            <Link href={pageHref(page + 1)} className="btn-secondary">
              Older
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}
