import type { Metadata } from "next";
import { connection } from "next/server";
import { contactConfigured } from "@/server/contact";
import { ContactForm } from "./contact-form";

export const metadata: Metadata = {
  title: "Contact · Proofshot",
  description: "For insurers and claims teams: tell us how claim photos reach you today.",
};

const POINTS = [
  { title: "A workspace for your team", body: "Claim Files, Claim Links to text to policyholders, and a Verdict on every photo that comes back." },
  { title: "Your past photos, as fingerprints", body: "Import fingerprints of earlier claim photos and get Duplicate Alerts from the first day. The photos stay with you." },
  { title: "A pilot on real claims", body: "Start with one line of business and one team. We set it up with you." },
];

export default async function ContactPage() {
  await connection(); // the mailbox comes from the server's environment
  return (
    <main className="mx-auto grid w-full max-w-6xl flex-1 gap-10 px-4 py-10 sm:py-14 lg:grid-cols-[1fr_1.2fr] lg:gap-14">
      <div className="flex flex-col gap-6">
        <header className="flex flex-col gap-3">
          <p className="eyebrow">For insurers and claims teams</p>
          <h1 className="display text-5xl sm:text-6xl">Talk to us</h1>
          <p className="text-lg text-foreground/80">
            Tell us how claim photos reach your team today and where they cause trouble. We read every message and reply
            by email.
          </p>
        </header>
        <ul className="flex flex-col">
          {POINTS.map((p) => (
            <li key={p.title} className="flex flex-col gap-1 border-t border-line py-4 last:border-b">
              <span className="font-semibold">{p.title}</span>
              <span className="text-foreground/80">{p.body}</span>
            </li>
          ))}
        </ul>
      </div>
      {contactConfigured() ? (
        <ContactForm />
      ) : (
        <p role="status" className="card self-start p-6">
          The contact form is not set up on this deployment yet.
        </p>
      )}
    </main>
  );
}
