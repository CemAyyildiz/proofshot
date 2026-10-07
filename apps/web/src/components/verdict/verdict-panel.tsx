import { IMPORTED_NOTE, type VerdictView, verdictCopy } from "./copy";
import { VerdictBanner } from "./verdict-badge";

export function VerdictPanel({ view, headingLevel = 2 }: { view: VerdictView; headingLevel?: 1 | 2 }) {
  const copy = verdictCopy(view);
  const H = headingLevel === 1 ? "h1" : "h2";
  return (
    <section aria-labelledby="verdict-heading" className="card rise-in overflow-hidden">
      <H id="verdict-heading" className="sr-only">
        Verdict: {copy.title}
      </H>
      <VerdictBanner kind={view.verdict} alterationCheck={view.alterationCheck} imported={view.record?.kind === "imported"} />
      <div className="flex flex-col gap-4 p-5">
        {"warning" in copy && copy.warning && (
          <p role="alert" className="border-l-4 border-verdict-altered pl-3 text-lg font-semibold">
            {copy.warning}
          </p>
        )}
        <p className="text-lg font-medium leading-snug">{copy.summary}</p>
        <dl className="grid gap-4 border-t border-line pt-4 text-sm sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <dt className="text-xs font-semibold uppercase tracking-wider text-muted">What this means</dt>
            <dd>{copy.means}</dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-xs font-semibold uppercase tracking-wider text-muted">What it does not mean</dt>
            <dd>{copy.doesNotMean}</dd>
          </div>
        </dl>
        {view.record?.kind === "imported" && <p className="text-sm text-muted">{IMPORTED_NOTE}</p>}
      </div>
    </section>
  );
}
