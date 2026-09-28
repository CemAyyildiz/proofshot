/**
 * One instance per server process. Next loads route handlers, pages and server actions in separate module
 * graphs, so a plain module-level `let` would give each graph its own database handle or relayer nonce queue.
 */
export function processSingleton<T>(name: string, create: () => T): T {
  const g = globalThis as typeof globalThis & { __proofshot?: Record<string, unknown> };
  const bag = (g.__proofshot ??= {});
  if (!(name in bag)) bag[name] = create();
  return bag[name] as T;
}
