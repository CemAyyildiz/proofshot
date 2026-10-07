import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { env } from "@/lib/env";
import { PasskeySpike } from "./passkey-spike";

export const metadata: Metadata = { title: "Spike B · Passkey fixture", robots: { index: false } };

export default function Page() {
  // Developer tool: hidden in production unless explicitly enabled for a real-device session.
  if (process.env.NODE_ENV === "production" && env().ENABLE_SPIKE_PAGES !== "1") notFound();
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-4 px-4 py-10">
      <h1 className="display text-3xl sm:text-4xl">Spike B: passkey fixture</h1>
      <p className="text-sm opacity-70">
        Developer tool. Creates a passkey on this device, signs a test Seal challenge and prints a Foundry fixture
        for <code>contracts/test/fixtures/</code>.
      </p>
      <PasskeySpike />
    </main>
  );
}
