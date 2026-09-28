export async function register() {
  // Fail fast at boot on invalid configuration rather than on the first request.
  const { env } = await import("./lib/env");
  env();
}
