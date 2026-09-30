import Link from "next/link";
import QRCode from "qrcode";
import { CameraIcon, CheckIcon, CodeIcon, CopiesIcon, FingerprintIcon, MinusIcon, ShieldCheckIcon, WarningIcon } from "@/components/icons";
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
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-16 px-4 py-10 sm:gap-20 sm:py-16">
      <section className="grid items-center gap-10 lg:grid-cols-[1.1fr_1fr] lg:gap-14">
        <div className="flex flex-col gap-5">
          <p className="eyebrow">Capture provenance for insurance claims</p>
          <h1 className="text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl">Claim photos that prove themselves.</h1>
          <p className="text-lg text-foreground/80">
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
            <Link href="/verify" className="btn-primary px-5">
              Verify a photo
            </Link>
            <Link href="/console" className="btn-secondary">
              Carrier Console
            </Link>
          </div>
          <aside
            className="hidden items-center gap-4 rounded-lg border border-line bg-surface p-3 pr-5 sm:flex sm:self-start"
            aria-label="Try it on your phone"
          >
            <div className="w-24 shrink-0 rounded bg-white p-1" dangerouslySetInnerHTML={{ __html: qr }} role="img" aria-label={`QR code for ${tryUrl}`} />
            <div className="flex flex-col gap-0.5">
              <p className="font-medium">Try it on your phone</p>
              <p className="text-sm text-muted">Scan to seal a photo, then try to fool the verifier. No sign-up.</p>
              <p className="break-all font-mono text-xs text-muted">{tryUrlShort}</p>
            </div>
          </aside>
        </div>
        <VerdictExample />
      </section>

      <section aria-labelledby="how-heading" className="flex flex-col gap-6">
        <h2 id="how-heading" className="text-2xl font-semibold tracking-tight">
          How it works
        </h2>
        <ol className="grid gap-4 sm:grid-cols-3">
          {STEPS.map(({ icon: Icon, title, body }, i) => (
            <li key={title} className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-5">
              <div className="flex items-center gap-3">
                <span className="grid size-9 place-items-center rounded-full bg-accent text-sm font-semibold text-accent-fg" aria-hidden="true">
                  {i + 1}
                </span>
                <Icon className="size-5 text-muted" />
              </div>
              <h3 className="text-lg font-semibold">{title}</h3>
              <p className="text-foreground/80">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="proof-heading" className="flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h2 id="proof-heading" className="text-2xl font-semibold tracking-tight">
            Don&apos;t take our word for it
          </h2>
          <p className="text-foreground/80">Every claim on this page can be checked from public data.</p>
        </div>
        <ul className="grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-3">
          {PROOF.map(({ icon: Icon, title, body, link }) => (
            <li key={title} className="flex flex-col gap-2 bg-surface p-5">
              <Icon className="size-6 text-foreground" />
              <h3 className="font-semibold">{title}</h3>
              <p className="text-sm text-foreground/80">{body}</p>
              {link && (
                <a href={link.href} className="mt-auto inline-flex min-h-11 items-center self-start text-sm font-medium underline underline-offset-4">
                  {link.label}
                </a>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="proves-heading" className="flex flex-col gap-6">
        <h2 id="proves-heading" className="text-2xl font-semibold tracking-tight">
          What a Seal proves, and what it does not
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-5">
            <h3 className="font-semibold">It proves</h3>
            <ul className="flex flex-col gap-2.5">
              {PROVES.map((t) => (
                <li key={t} className="flex gap-2.5">
                  <CheckIcon className="mt-0.5 size-5 shrink-0" />
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-col gap-3 rounded-lg border border-dashed border-line p-5">
            <h3 className="font-semibold">It does not prove</h3>
            <ul className="flex flex-col gap-2.5 text-foreground/80">
              {DOES_NOT_PROVE.map((t) => (
                <li key={t} className="flex gap-2.5">
                  <MinusIcon className="mt-0.5 size-5 shrink-0 text-muted" />
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </main>
  );
}
