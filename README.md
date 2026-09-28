# Proofshot

Claim photos that prove themselves. A policyholder seals each photo at capture with a device-bound passkey; the signature is verified onchain on Monad and the Capture Record (hashes and commitments only, never images) goes to a public Registry. Anyone holding any copy can check when it was sealed, whether it was altered, and whether it was already used in another claim.

## Layout

| Path | What |
|---|---|
| `apps/web` | Next.js app: Capture PWA, Carrier Console, Public Verifier, API routes |
| `packages/fingerprint` | PDQ / tile / Exact Hash fingerprints and the Verdict engine (browser, server, CLI) |
| `packages/shared` | Network config, typed env, shared types |
| `contracts` | Foundry project for the Registry contract |
| `cli` | `proofshot-verify`, reproduces a Verdict from public data only |

## Develop

Requires Node 22, pnpm 10 and Foundry.

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local
pnpm dev          # http://localhost:3000, health at /api/health
pnpm test         # vitest + forge test
pnpm typecheck && pnpm lint && pnpm build
```

Network is chosen by `PROOFSHOT_NETWORK` (`testnet` = Monad testnet 10143, `mainnet` = Monad 143).
