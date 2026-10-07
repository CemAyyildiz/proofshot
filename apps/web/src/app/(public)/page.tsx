import Link from "next/link";
import QRCode from "qrcode";
import { ArrowRightIcon, CameraIcon, CheckIcon, CodeIcon, CopiesIcon, FingerprintIcon, MinusIcon, ShieldCheckIcon, WarningIcon } from "@/components/icons";
import type { VerdictKind } from "@/components/verdict/copy";
import { VERDICT_LABEL, VerdictIcon } from "@/components/verdict/verdict-badge";
import { VerdictExample } from "@/components/landing/verdict-example";
import { env } from "@/lib/env";
import { StartDemoButton } from "./try/start-demo-button";

const STEPS = [
  {
    icon: CameraIcon,
    title: "Sealed at capture",
    body: "The policyholder takes the photo in Proofshot. One Face ID prompt signs it with a key that never leaves their phone, and a public ledger checks that signature before recording the seal.",
  },
  {
    icon: CopiesIcon,
    title: "Checked from any copy",
    body: "Anyone holding any copy, even one compressed by a messaging app, can see when it was sealed and exactly which regions were changed since.",
  },
  {
    icon: WarningIcon,
    title: "Reused photos caught",
    body: "Carriers share fingerprints, never photos. A photo already used in another claim, at any carrier, raises a Duplicate Alert.",
  },
] as const;

/** One line per Verdict, in the words the Public Verifier uses (components/verdict/copy.ts). */
const VERDICTS: { kind: VerdictKind; bg: string; body: string }[] = [
  { kind: "original", bg: "bg-verdict-original", body: "Exactly the sealed file. Not a single byte has changed." },
  { kind: "derived-copy", bg: "bg-verdict-derived", body: "The same picture, re-saved. A messaging app compressed it, nothing more." },
  { kind: "altered", bg: "bg-verdict-altered", body: "Matches a sealed photo, but regions were changed. A map shows which ones." },
  { kind: "no-record", bg: "bg-verdict-none", body: "Never sealed with Proofshot. That does not mean the image is fake." },
];

const PROVES = [
  "A specific device key signed these fingerprints.",
  "It happened within a tight, public time window.",
  "Whether the image changed since, and where.",
  "Whether the same picture already exists in another claim.",
];
const DOES_NOT_PROVE = [
  "That the pixels came from the camera sensor. Hardware attestation is our next milestone.",
  "That the scene is what the sender says it is.",
  "Who the person taking the photo is, legally.",
];

export default async function Home() {
  const { APP_URL, network, REGISTRY_ADDRESS, PUBLIC_REPO_URL } = env();
  const tryUrl = new URL("/try", APP_URL).toString();
  const qr = await QRCode.toString(tryUrl, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
  // Shown under the code for anyone whose camera won't scan it.
  const tryUrlShort = tryUrl.replace(/^https?:\/\//, "");
  const registryUrl = network.explorerUrl && REGISTRY_ADDRESS ? `${network.explorerUrl}/address/${REGISTRY_ADDRESS}` : null;

  // Each claim links to where it can be checked, when that place exists.
  const PROOF = [
    {
      icon: ShieldCheckIcon,
      title: "Verified onchain, on Monad",
      body: "The Registry contract checks each seal's passkey signature (P-256) with Monad's built-in support for it before recording it. No wallet, no extra app.",
      link: registryUrl ? { href: registryUrl, label: "Registry contract" } : null,
    },
    {
      icon: CodeIcon,
      title: "Reproducible without us",
      body: "An open-source verifier reads the public registry and reaches the same result as this site, for any copy of a photo.",
      link: PUBLIC_REPO_URL ? { href: PUBLIC_REPO_URL, label: "Source code" } : null,
    },
    {
      icon: FingerprintIcon,
      title: "Fingerprints, never photos",
      body: "Photos go only to the insurer. The registry holds hashes and visual fingerprints, which can't be turned back into the image.",
      link: null,
    },
  ];

  return (
    <main className="flex flex-1 flex-col">
      <section className="ink relative overflow-hidden">
        <div className="glow-bg absolute inset-0" aria-hidden="true" />
        <div className="relative mx-auto grid w-full max-w-6xl items-center gap-10 px-4 pb-14 pt-10 sm:pb-20 sm:pt-16 lg:grid-cols-[1.15fr_1fr] lg:gap-14">
          <div className="flex flex-col gap-6">
            <p className="eyebrow">Capture provenance for insurance claims</p>
            <h1 className="display text-[2.9rem] sm:text-7xl">
              Claim photos that <span className="mark">prove themselves.</span>
            </h1>
            <p className="max-w-xl text-lg text-foreground/85 sm:text-xl">
              An AI editor can add damage to a photo in seconds, and genuine photos get reused from one claim to the next.
              Proofshot seals each photo on the policyholder&apos;s phone at the moment of capture, so anyone can check it
              later without trusting us.
            </p>
            <div className="flex flex-col gap-3 sm:hidden">
              <StartDemoButton />
              <Link href="/verify" className="btn-secondary">
                Verify a photo
              </Link>
            </div>
            <div className="hidden flex-wrap gap-3 sm:flex">
              <Link href="/verify" className="btn-primary">
                Verify a photo
                <ArrowRightIcon className="size-5" />
              </Link>
              <Link href="/console" className="btn-secondary">
                Carrier Console
              </Link>
            </div>
            <aside className="card hidden items-center gap-4 p-3 pr-5 sm:flex sm:self-start" aria-label="Try it on your phone">
              <div className="w-24 shrink-0 rounded-lg bg-white p-1" dangerouslySetInnerHTML={{ __html: qr }} role="img" aria-label={`QR code for ${tryUrl}`} />
              <div className="flex flex-col gap-0.5">
                <p className="font-semibold">Try it on your phone</p>
                <p className="text-sm text-muted">Scan to seal a photo, then try to fool the verifier. No sign-up.</p>
                <p className="break-all font-mono text-xs text-muted">{tryUrlShort}</p>
              </div>
            </aside>
          </div>
          <div className="lg:rotate-1">
            <VerdictExample />
          </div>
        </div>
        <ul className="relative mx-auto grid w-full max-w-6xl gap-px border-t border-line px-4 text-xs font-semibold uppercase tracking-wider text-muted sm:grid-cols-3">
          <li className="py-4">Signed with a passkey · no app, no wallet</li>
          <li className="py-4 sm:text-center">Signature checked onchain, on Monad</li>
          <li className="py-4 sm:text-right">Any copy can be checked by anyone</li>
        </ul>
      </section>

      <section aria-labelledby="verdicts-heading" className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-14 sm:py-20">
        <div className="flex flex-col gap-3">
          <p className="eyebrow">One answer per photo</p>
          <h2 id="verdicts-heading" className="display text-4xl sm:text-5xl">
            Four Verdicts. Never a maybe.
          </h2>
          <p className="max-w-2xl text-lg text-foreground/80">Drop any copy of a photo into the Public Verifier and it returns exactly one of these.</p>
        </div>
        <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {VERDICTS.map(({ kind, bg, body }) => (
            <li key={kind} className={`flex min-h-52 flex-col justify-between gap-5 rounded-3xl p-4 text-verdict-fg sm:min-h-44 sm:p-5 ${bg}`}>
              <span className="grid size-11 place-items-center rounded-full border-2 border-current">
                <VerdictIcon kind={kind} className="size-6" />
              </span>
              <span className="flex flex-col gap-1.5">
                <span className="display text-2xl sm:text-3xl">{VERDICT_LABEL[kind]}</span>
                <span className="text-sm leading-snug">{body}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="how-heading" className="border-y border-line bg-surface">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-14 sm:py-20">
          <div className="flex flex-col gap-3">
            <p className="eyebrow">From the shutter to the claims desk</p>
            <h2 id="how-heading" className="display text-4xl sm:text-5xl">
              How it works
            </h2>
          </div>
          <ol className="grid gap-px overflow-hidden rounded-3xl border border-line bg-line sm:grid-cols-3">
            {STEPS.map(({ icon: Icon, title, body }, i) => (
              <li key={title} className="flex flex-col gap-4 bg-background p-6">
                <div className="flex items-center justify-between">
                  <span className="display text-6xl text-brand" aria-hidden="true">
                    0{i + 1}
                  </span>
                  <span className="grid size-11 place-items-center rounded-full bg-brand text-brand-fg">
                    <Icon className="size-5" />
                  </span>
                </div>
                <h3 className="display text-2xl">{title}</h3>
                <p className="text-foreground/80">{body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section aria-labelledby="proof-heading" className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-14 sm:py-20">
        <div className="flex flex-col gap-3">
          <p className="eyebrow">Open by design</p>
          <h2 id="proof-heading" className="display text-4xl sm:text-5xl">
            Don&apos;t take our word for it
          </h2>
          <p className="max-w-2xl text-lg text-foreground/80">Every claim on this page can be checked from public data.</p>
        </div>
        <ul className="grid gap-3 sm:grid-cols-3">
          {PROOF.map(({ icon: Icon, title, body, link }) => (
            <li key={title} className="card flex flex-col gap-3 p-6">
              <Icon className="size-7 text-foreground" />
              <h3 className="text-lg font-semibold">{title}</h3>
              <p className="text-foreground/80">{body}</p>
              {link && (
                <a href={link.href} className="mt-auto inline-flex min-h-11 items-center gap-1.5 self-start font-semibold underline decoration-brand decoration-2 underline-offset-4">
                  {link.label}
                  <ArrowRightIcon className="size-4" />
                </a>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="proves-heading" className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 pb-14 sm:pb-20">
        <div className="flex flex-col gap-3">
          <p className="eyebrow">Honest limits</p>
          <h2 id="proves-heading" className="display text-4xl sm:text-5xl">
            What a Seal proves, and what it does not
          </h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="card flex flex-col gap-4 p-6">
            <h3 className="display text-2xl">It proves</h3>
            <ul className="flex flex-col gap-3">
              {PROVES.map((t) => (
                <li key={t} className="flex gap-3">
                  <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-foreground text-background">
                    <CheckIcon className="size-4" />
                  </span>
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-col gap-4 rounded-3xl border-2 border-dashed border-line p-6">
            <h3 className="display text-2xl">It does not prove</h3>
            <ul className="flex flex-col gap-3 text-foreground/80">
              {DOES_NOT_PROVE.map((t) => (
                <li key={t} className="flex gap-3">
                  <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border border-line text-muted">
                    <MinusIcon className="size-4" />
                  </span>
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section aria-labelledby="cta-heading" className="on-brand">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-14 sm:flex-row sm:items-center sm:justify-between sm:py-16">
          <div className="flex flex-col gap-2">
            <h2 id="cta-heading" className="display text-4xl sm:text-5xl">
              Seal a photo. Then try to fool it.
            </h2>
            <p className="text-lg">About a minute on your phone. No sign-up, nothing to install.</p>
          </div>
          <Link href="/try" className="btn-primary shrink-0 px-8 text-lg">
            Open the demo
            <ArrowRightIcon className="size-5" />
          </Link>
        </div>
      </section>
    </main>
  );
}
