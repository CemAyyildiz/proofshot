import { IMPORTED_NOTE, type VerdictView, verdictCopy } from "./copy";
import { VerdictBadge } from "./verdict-badge";

export function VerdictPanel({ view, headingLevel = 2 }: { view: VerdictView; headingLevel?: 1 | 2 }) {
  const copy = verdictCopy(view);
  const H = headingLevel === 1 ? "h1" : "h2";
  return (
    <section aria-labelledby="verdict-heading" className="flex flex-col gap-3 rounded-md border border-line bg-surface p-4">
      <H id="verdict-heading" className="sr-only">
        Verdict: {copy.title}
      </H>
      <div>
        <VerdictBadge kind={view.verdict} alterationCheck={view.alterationCheck} imported={view.record?.kind === "imported"} />
      </div>
      {"warning" in copy && copy.warning && (
        <p role="alert" className="border-l-4 border-verdict-altered pl-3 text-lg font-semibold">
          {copy.warning}
        </p>
      )}
      <p className="text-lg">{copy.summary}</p>
      <dl className="grid gap-2 text-sm">
        <div>
          <dt className="font-semibold">What this means</dt>
          <dd className="text-foreground/80">{copy.means}</dd>
        </div>
        <div>
          <dt className="font-semibold">What it does not mean</dt>
          <dd className="text-foreground/80">{copy.doesNotMean}</dd>
        </div>
      </dl>
      {view.record?.kind === "imported" && <p className="text-sm text-muted">{IMPORTED_NOTE}</p>}
    </section>
  );
}
