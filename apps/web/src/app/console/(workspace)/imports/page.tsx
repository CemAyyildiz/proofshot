import type { Metadata } from "next";
import { Importer } from "./importer";

export const metadata: Metadata = { title: "Import history · Proofshot Console" };

export default function ImportsPage() {
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <h1 className="text-2xl font-semibold">Import photo history</h1>
      <p className="text-muted">
        Add fingerprints of photos from past claims so Duplicate Alerts work from day one. Each photo is fingerprinted
        and discarded — the images are not stored, and only fingerprints are shared, labelled &ldquo;imported
        (unsigned)&rdquo;.
      </p>
      <Importer />
    </div>
  );
}
