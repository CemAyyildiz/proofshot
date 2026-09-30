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

Set these in the hosting provider (see `apps/web/.env.example`):

| Variable | Value |
|---|---|
| `PROOFSHOT_NETWORK` | `testnet` or `mainnet` |
| `RPC_URL`, `RPC_URL_SECONDARY` | primary and fallback RPC |
| `REGISTRY_ADDRESS`, `REGISTRY_DEPLOY_BLOCK` | from `deployments/<chainId>.json` |
| `LOGS_BLOCK_RANGE` | max blocks per `eth_getLogs`; set it to your RPC's limit (the indexer halves the range automatically if the RPC refuses) |
| `RELAYER_PRIVATE_KEY` | the relayer key |
| `DATABASE_URL` | Postgres |
| `STORAGE_DRIVER` + `S3_*` | evidence image storage (see below) |
| `APP_URL` | public origin, e.g. `https://proofshot.app` |
| `RESEND_API_KEY`, `MAIL_FROM` | sign-in email (required in production: without it sign-in refuses rather than logging tokens) |
| `DEMO_ACCESS` | `1` on the judging deployment: one-tap entry into the two seeded demo carriers (never real ones) |
| `CRON_SECRET` | ≥ 16 random characters; `vercel.json` schedules the daily `/api/cron/maintenance` cleanup |

Then migrate and seed once:

```bash
DATABASE_URL=... pnpm --filter web db:migrate
DATABASE_URL=... pnpm --filter web db:seed northwind=you@example.com
```

The seeded Northwind and Harbor carriers are **demo tenants**: with `DEMO_ACCESS=1` any visitor can enter them, and
everything in them is visible to every visitor. Adding your email (as above) only lets you sign in to the demo
tenant by email; demo entry always acts as the seeded placeholder account, never as you. Never put real claim data
in a demo tenant.

Evidence images: on a host with a persistent disk use `STORAGE_DRIVER=fs` (+ `STORAGE_DIR`). On serverless hosts
(Vercel) use `STORAGE_DRIVER=s3` with a **private** S3-compatible bucket — Cloudflare R2 works (`S3_ENDPOINT=https://<account>.r2.cloudflarestorage.com`,
`S3_REGION=auto`) — plus `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`. Never make the bucket public: images
are served only through the tenant-checked Console routes.

## 3. Before judging

- External uptime check on `/`, `/verify` and `/api/health`. Health returns **503** when the relayer's balance is
  below `RELAYER_MIN_BALANCE_MON` (default 1 MON), the Registry is paused, or the chain is unreachable — so the
  uptime monitor is also the low-balance alarm. Each Seal costs ~100k gas.
- Seal latency (SM-5): once real Seals exist, `DATABASE_URL=… PROOFSHOT_NETWORK=mainnet pnpm --filter web
  report:latency --since <launch date>` writes `docs/latency.md` (p50/p95/max, Claim Links vs Try-it).
- Keep the admin key offline; the incident runbook is in the Registry's NatSpec and `docs/threat-model.md` (T-8).
