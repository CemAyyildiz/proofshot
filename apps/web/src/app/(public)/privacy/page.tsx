import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy · Proofshot",
  description: "What Proofshot records, where it goes, what is public and permanent, and what never leaves your phone.",
};

const SHORT = [
  "Your photos go to your insurer and to nobody else. They are never put on the blockchain.",
  "What is public is a set of fingerprints of each sealed photo. Fingerprints can't be turned back into the picture.",
  "Face ID, your fingerprint and your PIN never leave your phone. We receive a public key, nothing more.",
  "A photo you check in the verifier is not kept.",
  "No advertising, no analytics, no third-party scripts.",
];

interface Section {
  id: string;
  title: string;
  intro?: string;
  items: { term: string; text: string }[];
}

const SECTIONS: Section[] = [
  {
    id: "capture",
    title: "When you take photos through a Claim Link",
    intro: "Your insurer sends you a Claim Link. This is what happens when you use it.",
    items: [
      {
        term: "Your passkey",
        text: "Your phone creates a passkey and unlocks it with Face ID, your fingerprint or your PIN. That check happens on the phone. We receive the passkey's public key, and it is recorded on the blockchain so that anyone can check your photos' signatures.",
      },
      {
        term: "Your photos",
        text: "Each photo is kept on your phone, in this browser's storage, until you send it or discard it. When you tap Send, it goes to the insurer named at the top of the screen and is stored for that insurer only.",
      },
      {
        term: "The Seal",
        text: "For each photo, a Seal is written to the Monad blockchain: fingerprints of the photo, its width and height, the time, your passkey's ID, and coded references to the insurer and the claim that mean nothing to anyone else. The photo itself is not included.",
      },
      {
        term: "Your location",
        text: "We never ask for it. If you had already allowed this site to use your location, a scrambled commitment to the coordinates is added to the Seal, and the random value used to scramble it is shared with your insurer. The coordinates themselves stay on your phone.",
      },
      {
        term: "Timing",
        text: "We record how long each photo took to seal, to keep the service fast.",
      },
    ],
  },
  {
    id: "demo",
    title: "When you try the demo",
    items: [
      {
        term: "Demo photos",
        text: "A photo you seal in the demo stays on your phone. Only its fingerprints are recorded, in the same public way as any other Seal.",
      },
      {
        term: "The demo Console",
        text: "The two demo insurers are shared by every visitor. Anything uploaded there can be seen by other visitors and is deleted after 7 days. Don't put real claim photos in it.",
      },
    ],
  },
  {
    id: "verify",
    title: "When you verify a photo",
    items: [
      {
        term: "The image",
        text: "It is sent to our server, fingerprinted, compared with the public registry and discarded. It is not stored.",
      },
      {
        term: "The receipt",
        text: "Each check creates a receipt at an address that can't be guessed. It holds the file's SHA-256 fingerprint, its dimensions and the result, so the link keeps working when you share it. It never holds the image.",
      },
    ],
  },
  {
    id: "console",
    title: "When you use the Carrier Console",
    items: [
      {
        term: "Your account",
        text: "We keep your work email address and which insurer you belong to. Sign-in links are sent to that address by our email provider, Resend.",
      },
      {
        term: "One cookie",
        text: "Signing in sets a single cookie that keeps you signed in. It is not used for anything else, and no other part of the site sets cookies.",
      },
      {
        term: "Claim data",
        text: "Claim references, uploaded images and the photos policyholders send are stored for your insurer only. Another insurer sees that a matching photo exists, never the photo, the claim or who holds it.",
      },
    ],
  },
  {
    id: "contact",
    title: "When you contact us",
    items: [
      {
        term: "Your message",
        text: "The name, email address, company and message you enter are emailed to us through Resend and kept in our mailbox. We use them to reply to you.",
      },
    ],
  },
  {
    id: "everyone",
    title: "For every visitor",
    items: [
      {
        term: "Your network address",
        text: "It is used to limit how often one visitor can use the service. We store it only in a scrambled form that can't be read back, for at most two days. Our web server keeps no log of visits.",
      },
      {
        term: "Other companies",
        text: "The site loads nothing from other companies: no analytics, no advertising, no fonts or scripts from elsewhere. Your browser talks to our server only.",
      },
    ],
  },
];

export default function PrivacyPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-10 px-4 py-10 sm:py-14">
      <header className="flex flex-col gap-3">
        <p className="eyebrow">Privacy</p>
        <h1 className="display text-5xl sm:text-6xl">What happens to your data</h1>
        <p className="text-lg text-foreground/80">
          Proofshot exists so that people don&apos;t have to take anyone&apos;s word for a photo. The same goes for this
          page: it says what is recorded, where it goes and what can&apos;t be undone.
        </p>
      </header>

      <section aria-labelledby="short-heading" className="card flex flex-col gap-4 p-6">
        <h2 id="short-heading" className="display text-2xl">
          The short version
        </h2>
        <ul className="flex flex-col gap-3">
          {SHORT.map((t) => (
            <li key={t} className="flex gap-3">
              <span aria-hidden="true" className="mt-2.5 size-1.5 shrink-0 rounded-full bg-brand" />
              <span>{t}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="permanent-heading" className="flex flex-col gap-3 rounded-3xl border-2 border-dashed border-line p-6">
        <h2 id="permanent-heading" className="display text-2xl">
          What is public and can&apos;t be deleted
        </h2>
        <p>
          A Seal is a record on a public blockchain. Once written, nobody can change or remove it: not you, not your
          insurer and not us. That is what makes it worth trusting, and it is why a Seal holds fingerprints and coded
          references only, never a photo, a name, an address or a claim number.
        </p>
        <p className="text-foreground/80">
          Anyone who already holds a copy of a sealed photo can use those fingerprints to confirm when it was sealed and
          whether it was changed. Someone without a copy learns nothing about what the photo shows.
        </p>
      </section>

      {SECTIONS.map((s) => (
        <section key={s.id} aria-labelledby={`${s.id}-heading`} className="flex flex-col gap-4">
          <h2 id={`${s.id}-heading`} className="display text-2xl sm:text-3xl">
            {s.title}
          </h2>
          {s.intro && <p className="text-foreground/80">{s.intro}</p>}
          <dl className="flex flex-col">
            {s.items.map((i) => (
              <div key={i.term} className="grid gap-1 border-t border-line py-4 last:border-b sm:grid-cols-[11rem_1fr] sm:gap-6">
                <dt className="font-semibold">{i.term}</dt>
                <dd className="text-foreground/80">{i.text}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}

      <section aria-labelledby="who-heading" className="flex flex-col gap-3">
        <h2 id="who-heading" className="display text-2xl sm:text-3xl">
          Who runs this, and how to reach us
        </h2>
        <p className="text-foreground/80">
          Proofshot is built and run by Cem Ayyıldız. To ask what we hold about you, or to have it removed where that is
          possible, write to us through the{" "}
          <Link href="/contact" className="font-semibold text-foreground underline decoration-brand decoration-2 underline-offset-4">
            contact form
          </Link>
          . Photos you sent to an insurer are held for that insurer: ask them first.
        </p>
        <p className="text-sm text-muted">Last updated 7 October 2026.</p>
      </section>
    </main>
  );
}
