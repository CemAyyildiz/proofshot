import type { AlterationCheck, VerdictKind } from "./copy";

const STYLE: Record<VerdictKind, string> = {
  original: "bg-verdict-original",
  "derived-copy": "bg-verdict-derived",
  altered: "bg-verdict-altered",
  "no-record": "bg-verdict-none",
};

export const VERDICT_LABEL: Record<VerdictKind, string> = {
  original: "Original",
  "derived-copy": "Derived Copy",
  altered: "Altered",
  "no-record": "No Record",
};

export function VerdictIcon({ kind, className = "size-4" }: { kind: VerdictKind; className?: string }) {
  const common = { className, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 2, "aria-hidden": true };
  switch (kind) {
    case "original":
      return (
        <svg {...common}>
          <path d="M3 8.5l3 3 7-7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "derived-copy":
      return (
        <svg {...common}>
          <rect x="5" y="5" width="8" height="8" rx="1" />
          <path d="M3 10V4a1 1 0 0 1 1-1h6" />
        </svg>
      );
    case "altered":
      return (
        <svg {...common}>
          <path d="M8 2l6.5 11.5h-13z" strokeLinejoin="round" />
          <path d="M8 6.5v3M8 11.5v.5" strokeLinecap="round" />
        </svg>
      );
    case "no-record":
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="6" />
          <path d="M4 12l8-8" />
        </svg>
      );
  }
}

/** Verdict conveyed by colour, icon and text together — never colour alone (NFR-7). */
export function VerdictBadge({ kind, alterationCheck, imported }: { kind: VerdictKind; alterationCheck?: AlterationCheck; imported?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold text-verdict-fg ${STYLE[kind]}`}>
      <VerdictIcon kind={kind} />
      {VERDICT_LABEL[kind]}
      {alterationCheck === "unavailable" && <span className="font-normal">· check unavailable</span>}
      {imported && <span className="font-normal">· imported (unsigned)</span>}
    </span>
  );
}

/** The Verdict as the headline of a result: a full-width band in the Verdict colour, readable at arm's length. */
export function VerdictBanner({ kind, alterationCheck, imported }: { kind: VerdictKind; alterationCheck?: AlterationCheck; imported?: boolean }) {
  return (
    <div className={`flex items-center gap-3 px-5 py-4 text-verdict-fg ${STYLE[kind]}`}>
      <span className="grid size-11 shrink-0 place-items-center rounded-full border-2 border-current">
        <VerdictIcon kind={kind} className="size-6" />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="font-mono text-[0.7rem] font-medium uppercase tracking-[0.14em]">Verdict</span>
        <span className="display text-3xl sm:text-4xl">{VERDICT_LABEL[kind]}</span>
        {alterationCheck === "unavailable" && <span className="text-sm">· check unavailable</span>}
        {imported && <span className="text-sm">· imported (unsigned)</span>}
      </span>
    </div>
  );
}
