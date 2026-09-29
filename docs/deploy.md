# Deploy runbook

## 1. Registry (testnet, then mainnet)

Keys: a **deployer**, an **admin** (cold, never on a server) and a **relayer** (hot, funded with MON, lives in the
app's env). The contract rejects admin == relayer.

```bash
cd contracts
export MONAD_TESTNET_RPC_URL=https://testnet-rpc.monad.xyz
REGISTRY_ADMIN=0x<admin> REGISTRY_RELAYER=0x<relayer> REGISTRY_RP_IDS=<your-domain> \
  pnpm deploy:testnet --private-key $DEPLOYER_PRIVATE_KEY
forge verify-contract <address> src/Registry.sol:Registry --chain 10143 --verifier sourcify
```

The script refuses to run on the wrong chain and writes `contracts/deployments/<chainId>.json` with the address and
deploy block. `REGISTRY_RP_IDS` must list the exact hostname passkeys are created on (e.g. `proofshot.app`); preview
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
| `APP_URL` | public origin, e.g. `https://proofshot.app` |
| `RESEND_API_KEY`, `MAIL_FROM` | sign-in email (required in production: without it sign-in refuses rather than logging tokens) |
| `CRON_SECRET` | ≥ 16 random characters; `vercel.json` schedules the daily `/api/cron/maintenance` cleanup |

Then migrate and seed once:

```bash
DATABASE_URL=... pnpm --filter web db:migrate
DATABASE_URL=... pnpm --filter web db:seed northwind=you@example.com
```

Evidence images use filesystem storage (`STORAGE_DIR`), which needs a persistent disk. Serverless hosts need an
object-storage adapter for `src/server/storage.ts` (pending).

## 3. Before judging

- External uptime check on `/`, `/verify` and `/api/health`. Health returns **503** when the relayer's balance is
  below `RELAYER_MIN_BALANCE_MON` (default 1 MON), the Registry is paused, or the chain is unreachable — so the
  uptime monitor is also the low-balance alarm. Each Seal costs ~100k gas.
- Keep the admin key offline; the incident runbook is in the Registry's NatSpec and `docs/threat-model.md` (T-8).
