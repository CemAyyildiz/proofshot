# Deploy runbook

## 1. Registry (testnet, then mainnet)

Keys: a **deployer**, an **admin** (cold, never on a server) and a **relayer** (hot, funded with MON, lives in the
app's env). The contract never lets one account hold both roles, at deploy or later. There is exactly one admin,
and it moves only by a two-step transfer: `beginDefaultAdminTransfer(new)`, then the new key calls
`acceptDefaultAdminTransfer()` after 1 day. A plain `renounceRole` can't orphan the Registry.

```bash
cd contracts
export MONAD_TESTNET_RPC_URL=https://testnet-rpc.monad.xyz
REGISTRY_ADMIN=0x<admin> REGISTRY_RELAYER=0x<relayer> REGISTRY_RP_IDS=<your-domain> \
  pnpm deploy:testnet --private-key $DEPLOYER_PRIVATE_KEY
forge verify-contract <address> src/Registry.sol:Registry --chain 10143 --verifier sourcify
```

The script refuses the wrong chain, an empty RP ID list (the Registry would accept no passkey at all) and `localhost`
on mainnet. It writes `contracts/deployments/<chainId>.json` with the address, the deploy block (a lower bound for
`REGISTRY_DEPLOY_BLOCK`), the admin, relayer and deployer addresses, the admin-transfer delay and the RP IDs. `REGISTRY_RP_IDS` must list the exact hostname passkeys are created on (e.g. `proofshot.app`); preview
hostnames need their own entry (`setRpIdHash` from the admin key).

Mainnet: the same with `MONAD_MAINNET_RPC_URL` and `pnpm deploy:mainnet` (chain 143).

## 2. App

**Host: a long-running Node server, not serverless functions.** Photos are uploaded to the app itself (sealed photos
sent to the insurer, the Public Verifier, Console uploads, 10-image import batches), and ordinary phone photos are
2–8 MB. Vercel Functions cap request bodies at **4.5 MB** ([Vercel limits](https://vercel.com/docs/functions/limitations#request-body-size)),
which would reject most of them with `413 FUNCTION_PAYLOAD_TOO_LARGE`. A persistent server also keeps the in-memory
Registry index warm and makes the per-process decode limit meaningful.

The repository ships a [`railway.json`](../railway.json) (Railway: no platform body limit; build, `db:migrate` before
each deploy, start, health check). Add a Postgres database and a Volume mounted at `/data`, then set the variables
below with `STORAGE_DRIVER=fs` and `STORAGE_DIR=/data/storage`. Any comparable Node host works the same way:
`pnpm install`, `pnpm --filter web build`, `pnpm --filter web db:migrate`, `pnpm --filter web start` (listens on
`$PORT`).

Set these on the host (see `apps/web/.env.example`):

| Variable | Value |
|---|---|
| `PROOFSHOT_NETWORK` | `testnet` or `mainnet` |
| `RPC_URL`, `RPC_URL_SECONDARY` | primary and fallback RPC |
| `REGISTRY_ADDRESS`, `REGISTRY_DEPLOY_BLOCK` | from `deployments/<chainId>.json` |
| `LOGS_BLOCK_RANGE` | max blocks per `eth_getLogs`; set it to your RPC's limit (the indexer halves the range automatically if the RPC refuses) |
| `RELAYER_PRIVATE_KEY` | the relayer key |
| `RELAYER_MAX_FEE_GWEI` | fee ceiling, default 500 (Monad's floor is 100). Monad charges the gas **limit**, which the relayer sets to the estimate with no padding (asserted in e2e); above the ceiling Seals wait and `/api/health` reports `gas-price-above-cap` |
| `DATABASE_URL` | Postgres |
| `STORAGE_DRIVER` + `S3_*` | evidence image storage (see below) |
| `APP_URL` | public origin, e.g. `https://proofshot.app` |
| `RESEND_API_KEY`, `MAIL_FROM` | sign-in email. Required in production: without it no link is sent (tokens are never logged), and `/api/health` returns 503 with `sign-in-email-not-configured` |
| `DEMO_ACCESS` | `1` on the judging deployment: one-tap entry into the two seeded demo carriers (never real ones) |
| `CRON_SECRET` | ≥ 16 random characters; the daily `/api/cron/maintenance` cleanup is called by the `Daily maintenance` GitHub workflow (set repository variable `APP_URL` and secret `CRON_SECRET`) or any scheduler that sends a GET with `Authorization: Bearer $CRON_SECRET` (expired sessions and tokens, old rate-limit windows, and demo/sandbox Claim Files older than 7 days with their images; real carriers are never touched) |

Then migrate and seed once:

```bash
DATABASE_URL=... pnpm --filter web db:migrate
DATABASE_URL=... pnpm --filter web db:seed northwind=you@example.com
```

The seeded Northwind and Harbor carriers are **demo tenants**: with `DEMO_ACCESS=1` any visitor can enter them, and
everything in them is visible to every visitor. Adding your email (as above) only lets you sign in to the demo
tenant by email; demo entry always acts as the seeded placeholder account, never as you. Never put real claim data
in a demo tenant.

Evidence images: on a host with a persistent disk (a Railway Volume) use `STORAGE_DRIVER=fs` with `STORAGE_DIR` on
that disk. Without one, use `STORAGE_DRIVER=s3` with a **private** S3-compatible bucket — Cloudflare R2 works
(`S3_ENDPOINT=https://<account>.r2.cloudflarestorage.com`, `S3_REGION=auto`) — plus `S3_BUCKET`, `S3_ACCESS_KEY_ID`,
`S3_SECRET_ACCESS_KEY`. Never make the bucket public: images are served only through the tenant-checked Console
routes.

## 3. Before judging

- External uptime check on `/`, `/verify` and `/api/health`. Health returns **503** when the relayer's balance is
  below `RELAYER_MIN_BALANCE_MON` (default 1 MON), the Registry is paused, or the chain is unreachable — so the
  uptime monitor is also the low-balance alarm. Each Seal costs ~100k gas.
- Seal latency (SM-5): once real Seals exist, `DATABASE_URL=… PROOFSHOT_NETWORK=mainnet pnpm --filter web
  report:latency --since <launch date>` writes `docs/latency.md` (p50/p95/max, Claim Links vs Try-it).
- Keep the admin key offline (hardware wallet or encrypted keystore). Pausing, rotating the relayer, allowing a new
  hostname and handing over the admin role are copy-paste `cast` commands in [runbook.md](runbook.md), each one
  executed in CI against a throwaway chain.
