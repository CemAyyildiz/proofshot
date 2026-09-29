import { RegistryUnavailable } from "./registry";

/** Rejects bodies without a declared length or above `max` before anything is parsed into memory. */
export function bodyTooLarge(request: Request, max: number): Response | null {
  const raw = request.headers.get("content-length");
  if (raw === null) return Response.json({ error: "Upload size unknown. Try again." }, { status: 411 });
  if (Number(raw) > max) return Response.json({ error: "This upload is too large." }, { status: 413 });
  return null;
}

/** Maps a Registry outage to an honest 503 instead of a guessed Verdict or an opaque 500. */
export async function withRegistry(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof RegistryUnavailable) {
      return Response.json({ error: "The public registry is temporarily unreachable, so no Verdict can be given. Try again in a minute." }, { status: 503 });
    }
    throw err;
  }
}
