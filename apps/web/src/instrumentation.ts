/** Runs once when the server starts (never during `next build`, and only in the Node.js runtime). */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NEXT_PHASE === "phase-production-build") return;
  const { keepRegistryWarm } = await import("./server/registry/keep-warm");
  keepRegistryWarm();
}
