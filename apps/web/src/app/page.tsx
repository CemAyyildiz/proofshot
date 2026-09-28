export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-6 px-4 py-16">
      <p className="text-sm font-medium uppercase tracking-widest opacity-60">Proofshot</p>
      <h1 className="text-4xl font-semibold leading-tight">Claim photos that prove themselves.</h1>
      <p className="text-lg opacity-80">
        Sealed on the policyholder&apos;s device at the moment of capture. Anyone holding any copy
        can check when it was sealed, whether it was altered, and whether it was used before.
      </p>
    </main>
  );
}
