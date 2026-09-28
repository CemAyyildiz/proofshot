import "server-only";
import { getStorage } from "../storage";

/** Streams a stored evidence image to its own Carrier only; never cacheable by shared caches. */
export async function evidenceImageResponse(key: string | null) {
  if (!key) return new Response("Not found", { status: 404 });
  const bytes = await getStorage().get(key);
  if (!bytes) return new Response("Not found", { status: 404 });
  return new Response(bytes as Uint8Array<ArrayBuffer>, {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" },
  });
}
