import type { Metadata } from "next";
import { PasskeySpike } from "./passkey-spike";

export const metadata: Metadata = { title: "Spike B · Passkey fixture", robots: { index: false } };

export default function Page() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-4 px-4 py-10">
      <h1 className="text-2xl font-semibold">Spike B: passkey fixture</h1>
      <p className="text-sm opacity-70">
        Developer tool. Creates a passkey on this device, signs a test Seal challenge and prints a Foundry fixture
        for <code>contracts/test/fixtures/</code>.
      </p>
      <PasskeySpike />
    </main>
  );
}
