import Link from "next/link";
import QRCode from "qrcode";
import { env } from "@/lib/env";
import { StartDemoButton } from "./try/start-demo-button";

const STEPS = [
  ["Sealed at capture", "The policyholder takes the photo in Proofshot. One Face ID prompt signs it with a key that never leaves their phone, and a public ledger checks that signature before recording the seal."],
  ["Checked from any copy", "Anyone holding any copy, even one compressed by a messaging app, can see when it was sealed and exactly which regions were changed since."],
  ["Reused photos caught", "Carriers share fingerprints, never photos. A photo already used in another claim, at any carrier, raises a Duplicate Alert."],
] as const;

export default async function Home() {
  const tryUrl = new URL("/try", env().APP_URL).toString();
  const qr = await QRCode.toString(tryUrl, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
  // Shown under the code for anyone whose camera won't scan it.
  const tryUrlShort = tryUrl.replace(/^https?:\/\//, "");

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-14 px-4 py-10 sm:py-16">
      <section className="grid items-center gap-10 sm:grid-cols-[1.4fr_1fr]">
        <div className="flex flex-col gap-5">
          <p className="eyebrow">Capture provenance for insurance claims</p>
          <h1 className="text-4xl font-semibold leading-tight sm:text-5xl">Claim photos that prove themselves.</h1>
          <p className="text-lg text-muted">
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
        </div>
        <aside className="hidden flex-col items-center gap-3 rounded-lg border border-line bg-surface p-6 text-center sm:flex" aria-label="Try it on your phone">
          <div className="w-48 rounded bg-white p-2" dangerouslySetInnerHTML={{ __html: qr }} role="img" aria-label={`QR code for ${tryUrl}`} />
          <p className="font-medium">Try it on your phone</p>
          <p className="text-sm text-muted">Scan to seal a photo, then try to fool the verifier. No sign-up.</p>
          <p className="break-all font-mono text-xs text-muted">{tryUrlShort}</p>
        </aside>
      </section>

      <section aria-labelledby="how-heading" className="flex flex-col gap-6">
        <h2 id="how-heading" className="text-2xl font-semibold">
          How it works
        </h2>
        <ol className="grid gap-4 sm:grid-cols-3">
          {STEPS.map(([title, body], i) => (
            <li key={title} className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-5">
              <span className="text-sm font-semibold text-muted">{i + 1}</span>
              <h3 className="font-semibold">{title}</h3>
              <p className="text-sm text-muted">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="monad-heading" className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-5">
        <h2 id="monad-heading" className="text-lg font-semibold">
          Checked onchain, on Monad
        </h2>
        <p className="text-sm text-muted">
          Each seal is verified by a smart contract on Monad using the network&apos;s native support for the signatures
          phones already make (passkeys, P-256) — no wallet, no extra app. We confirmed that path on Monad testnet and
          mainnet; the registry holds fingerprints only, never photos.
        </p>
      </section>

      <section aria-labelledby="proves-heading" className="grid gap-6 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <h2 id="proves-heading" className="text-xl font-semibold">
            What a Seal proves
          </h2>
          <ul className="ml-5 list-disc text-muted">
            <li>A specific device key signed these fingerprints.</li>
            <li>It happened within a tight, public time window.</li>
            <li>Whether the image changed since, and where.</li>
            <li>Whether the same picture already exists in another claim.</li>
          </ul>
        </div>
        <div className="flex flex-col gap-2">
          <h2 className="text-xl font-semibold">What it does not prove</h2>
          <ul className="ml-5 list-disc text-muted">
            <li>That the pixels came from the camera sensor. Hardware attestation is our next milestone.</li>
            <li>That the scene is what the sender says it is.</li>
            <li>Who the person taking the photo is, legally.</li>
          </ul>
        </div>
      </section>
    </main>
  );
}
