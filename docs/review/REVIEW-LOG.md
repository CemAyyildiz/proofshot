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
