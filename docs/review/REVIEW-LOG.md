# Review log

Rolling senior review of Proofshot. Each iteration reviews one area, records findings with severity, fixes the
highest-value ones, and says what to review next. Screenshots: `SCREENS=1 pnpm --filter web e2e screens`
(→ `apps/web/test-results/screens/`).

Severity: **H** high (hurts trust, correctness or a demo moment) · **M** medium · **L** low.

## Rotation

1. Frontend UI/UX · 2. Backend · 3. Contracts · 4. Tests/CI · 5. Docs/README — then repeat.

---

## Iteration 1 — Frontend UI/UX (2026-09-30)

Design direction (ui-ux-pro-max `--design-system`, insurance/trust): Swiss minimal, IBM Plex Sans + Plex Mono,
SVG icons not emoji, visible focus, reduced motion, 150–250 ms transitions. Palette kept (neutral + navy);
the suggested sky-blue palette reads less "bank statement" than the current one.

Findings:

- **H1** No brand shell on public surfaces (landing, verifier, receipts, /try): no wordmark, no way back, no footer.
  The product looks unfinished when a judge lands on a receipt link.
- **H2** Capture screen: the shutter is a bare white circle with no affordance text; no photo count; no reassurance
  about where photos go. Policyholders need to know tapping seals and that only their insurer receives them.
- **M1** Typography: Geist is fine but generic; Plex Sans/Mono fits insurance and makes hashes/IDs legible.
- **M2** No global `:focus-visible` style, no `cursor-pointer`, no transitions, no reduced-motion rule.
- **M3** Duplicate Alert uses an emoji "⚠" as its icon.
- **M4** Console Claim File list is a plain list; adjusters need at-a-glance evidence count, alerts and link state.
- **M5** Verifier result doesn't show which file was checked unless Altered.
- **M6** Landing on desktop has no primary button (only the QR card and a secondary "Verify a photo").
- **L1** Next dev indicator visible in screenshots (dev only, not shipped).

Fixed this iteration: H1, H2, M1, M2, M3, M4, M5, M6.

Done (commit 6803c64): all eight findings fixed; `pnpm check` and 13 e2e green. Also fixed a build warning
(dynamic storage path traced the whole project).

**Next: Iteration 2 — Backend.** Review: authorization on every route (console APIs, receipts), input validation
and size limits (multipart parsing before size checks), rate limits on the Public Verifier (none yet), error
handling that could leak internals, Seal flow consistency if the DB insert fails after an onchain success,
registry index staleness on multi-instance deploys, security headers (CSP, frame-ancestors), cookie flags.

---

## Iteration 2 — Backend (2026-09-30)

Reviewed every route handler, server action, the auth flow, the Seal/enroll/send services and the config.

Findings:

- **H1** Public Verifier has no rate limit. Fingerprinting a 20 MB image is the most CPU-expensive request in the
  app and it is unauthenticated — a trivial DoS / cost vector.
- **H2** Magic-link sign-in has no rate limit: anyone can make us send unlimited emails to a Carrier User
  (email bombing, sender-reputation damage) or burn CPU on token issuance.
- **H3** Seal consistency: if the relayer's transaction succeeds but the `captures` insert fails (or the response is
  lost and the client retries), the retry hits `AlreadySealed` onchain with no DB row. The Capturer is told the photo
  was "sealed elsewhere" and can never send it — a lost piece of evidence.
- **M1** No security headers: no CSP, no `frame-ancestors` (the capture page and Console could be framed for
  clickjacking), no `Referrer-Policy` (Claim Link tokens could leak in `Referer` to the block explorer), no
  `Permissions-Policy`.
- **M2** Upload routes parse multipart bodies with no `Content-Length` (chunked) before any size check.
- **M3** A registry sync failure (RPC down) surfaces as an opaque 500 on the Verifier and receipts; it should be an
  honest "temporarily unavailable", never a guess.
- **L1** `x-powered-by: Next.js` header is sent.
- OK: tenancy — every Console route and DAL function is Carrier-scoped (covered by tests); cookies are HttpOnly,
  SameSite=Lax (blocks cross-site POSTs to cookie-authenticated upload routes), Secure in production; tokens are
  stored hashed; Claim Link tokens are 192-bit.

Done: H1–H3, M1–M3, L1 fixed; `pnpm check` and all e2e green with the CSP active in dev (capture, browser WASM
and the Verifier all run under it).

- H1 Public Verifier: 30 checks per 10 min per hashed client address → 429 with a plain message.
- H2 Sign-in: 5 links/hour per address (env-tunable for tests) and 20/hour per client, applied before the account
  lookup so the limit reveals nothing; the form shows "Too many sign-in requests".
- H3 Seal reconciliation: the relay and the DB write are separate steps. An onchain Seal never becomes an error;
  on `AlreadySealed`, the indexed Registry is consulted and the Capture is adopted only if both the Claim File
  (`claimRef`) and the Device Key match. The send step does the same, so evidence can't be stranded.
- M1 CSP (no third-party origins, `frame-ancestors 'none'`, `wasm-unsafe-eval` for PDQ), `Referrer-Policy:
  same-origin` (Claim Link tokens never leak to the explorer), `X-Frame-Options`, `Permissions-Policy`
  (camera/geolocation self only), HSTS. Asserted in e2e.
- M2 Upload routes require `Content-Length` (411) and check size before parsing.
- M3 Registry outage → `RegistryUnavailable` → 503 "no Verdict can be given"; error boundaries for public pages and
  the Console say so honestly.
- L1 `poweredByHeader: false`.

**Next: Iteration 3 — Contracts.** Review Registry.sol for gas (event layout, calldata), griefing (relayer key
compromise blast radius, admin powers), `importRecords` unbounded loops, `rpIdHash` extraction edge cases, the
Signing Window with `block.number` on Monad, upgrade/redeploy story, NatSpec, deploy script safety (chain-id check,
dry run), and a Slither-style manual pass.

---

## Iteration 3 — Contracts (2026-09-30)

Reviewed `Registry.sol`, its tests and the deploy script.

Findings:

- **H1** Relayer-key compromise had no containment. The relayer can register a key it controls and forge Seals or
  Imported Records under any `carrierId` (inherent to relayer attestation in v1), and the contract offered no way to
  stop it: no pause, and only the relayer itself could revoke Device Keys.
- **M1** Nothing prevented deploying with `admin == relayer`, which would put the admin role on a server hot key.
- **M2** The deploy script had no chain-id guard (a testnet config could be broadcast to mainnet) and didn't record
  the deploy block the indexer needs (`REGISTRY_DEPLOY_BLOCK`).
- **L1** `MAX_LAG = 100` blocks (~30–40 s) is tight if a Capturer hesitates at the Face ID prompt; the UI already
  says "took too long — retry" and retry re-signs with a fresh block. Kept: a tight Signing Window is the claim.
- **L2** Admin transfer is single-step (`AccessControl`); `AccessControlDefaultAdminRules` would add a delay.
  Deferred: the admin is a cold key used rarely.
- **L3** `forge lint` flags `1 << bit` in fuzz tests as a reversed shift — false positive (intended).
- OK: minimal state (SM-C3), all write paths role-gated, distinct custom errors, replay/window/UV/RP ID checks,
  imports idempotent and never block a later Seal, 1,024-run fuzz over every signed field.

Done: H1, M1, M2.

- `Pausable`: the admin pauses/unpauses every write; the admin can also revoke Device Keys. NatSpec documents the
  incident runbook (pause → revoke relayer role and its keys → grant a fresh relayer → unpause), covered by an
  end-to-end test.
- Constructor rejects `admin == relayer`.
- Deploy script requires `EXPECTED_CHAIN_ID` to match and writes `deployments/<chainId>.json` (address, deploy block,
  roles, RP IDs); `pnpm deploy:testnet` / `deploy:mainnet` set the expected chain.
- `seal()` gas now 100,315 (+2.2k for the pause check). 24 Registry tests.

**Next: Iteration 4 — Tests/CI.** Check CI actually runs e2e with Foundry + Chrome (Playwright browser install,
Anvil on the runner), flaky patterns (fixed sleeps, shared state), coverage gaps (sign-in rate limit, verifier 429,
receipts 404, CSP on capture), test runtime, and add a coverage report for the contracts.

---

## Iteration 4 — Tests/CI (2026-09-30)

Findings:

- **H1** e2e ran only against `next dev`. Both earlier bundling bugs (`import.meta.url`, PGlite) existed only in
  bundled code, and the production CSP (no `unsafe-eval`) was never exercised. Running the suite against
  `next build && next start` immediately found a real bug:
- **H2** (bug) The in-memory Registry index syncs at most once a second. A check made within a second of this
  server's own write — an import followed by an in-file verification, or two quick Seals — could miss the new
  record: a forwarded copy of a just-imported photo came back **No Record** instead of Derived Copy + Duplicate Alert.
- **M1** No tests for the new safeguards: sign-in limits, HTTP guards (411/413, 503), Verifier 429, receipt 404s.
- **M2** CI ran everything in one job, re-downloaded Chromium each time, and kept no artifacts on failure.
- **M3** Registry branch coverage 86.67% (revoke edge cases, zero RP ID untested).
- OK: no fixed sleeps in functional e2e (only in the on-demand screenshot tool); tests isolate state (fresh DB,
  storage and chain per run; per-client rate-limit buckets).

Done: all five.

- `E2E_PROD=1` runs the suite against the production build; CI's e2e job uses it. Both modes pass (14/14).
- The relayer invalidates the Registry index after its own Seals and imports, so the next read resyncs.
- Unit tests for `signInAllowed` (per address, per client, window reset) and `bodyTooLarge` / `withRegistry`;
  e2e for Verifier 429 (isolated client) and receipt 404s.
- CI: parallel `check` and `e2e` jobs, Playwright browser cache, report/trace artifacts on failure, 20-min timeout.
- Contracts: `pnpm --filter @proofshot/contracts coverage` (`--ir-minimum`); Registry now 96% lines, 97% statements,
  **100% branches**, 100% functions.

Totals: 65 web unit tests, 26 fingerprint, 11 shared, 36 contract tests, 14 e2e (dev and prod).

**Next: Iteration 5 — Docs/README.** Root README for judges (what, why Monad, how to run, architecture diagram,
reproducing a Verdict), per-package READMEs, `.env.example` completeness, deploy runbook (testnet/mainnet, Vercel),
threat model page, and consistency of claims with measured numbers.

---

## Iteration 5 — Docs/README (2026-09-30)

Findings:

- **H1** Receipts told third parties to run `npx proofshot-verify …`, but the package isn't published — a broken
  instruction on the page whose whole point is independent reproduction.
- **H2** The README didn't explain the product, the proof boundary or why Monad, and its quickstart didn't work
  (no local chain, no seed; copying `.env.example` left capture unable to seal).
- **H3** `RPC_URL_SECONDARY` was documented but unused: the NFR-4 "secondary RPC" didn't exist.
- **M1** `.env.example` was incomplete ("Filled in by later stories").
- **M2** No architecture, threat-model or deploy documentation outside the PRD.

Done: all five.

- Receipts show the from-source CLI command (`pnpm --filter proofshot-verify start …`) and state that it reads the chain
  directly; `cli/README.md` added.
- `rpcTransport()`: viem `fallback([primary, secondary])` for the relayer, indexer and block-time lookups.
- New README (what, who, proof boundary, why Monad with the measured gas and what is still pending, sequence diagram,
  reproduce a Verdict, working quickstart with `pnpm dev:chain` + `pnpm seed`, quality commands, honest limits).
- `docs/architecture.md` (component diagram, data-placement table, flows), `docs/threat-model.md` (T-1…T-9 incl.
  relayer compromise and crop+edit), `docs/deploy.md` (key roles, deploy script, env table, migrate/seed, pre-judging
  checklist; notes the pending object-storage adapter).
- Root `pnpm seed` / `pnpm e2e`; complete, commented `.env.example`.

Rotation complete. **Next: Iteration 6 — Frontend UI/UX, pass 2**: receipts (desktop + mobile), Console Claim File
page with many items, imports page, error/empty/loading states, dark mode, keyboard-only walkthrough of capture and
Console, copy review against NFR-9 and PRD §12.
