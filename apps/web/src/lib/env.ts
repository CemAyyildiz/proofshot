import { loadServerEnv, type ServerEnv } from "@proofshot/shared";

let cached: ServerEnv | undefined;

/** Validated server env, parsed once per server instance. Throws EnvError on bad config. */
export function env(): ServerEnv {
  cached ??= loadServerEnv();
  return cached;
}
