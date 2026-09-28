---
stepsCompleted: [1, 2, 3]
inputDocuments:
  - _bmad-output/planning-artifacts/prds/prd-proofshot-2026-09-28/prd.md
  - _bmad-output/planning-artifacts/prds/prd-proofshot-2026-09-28/addendum.md
---

# proofshot - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for proofshot, decomposing the requirements from the PRD, UX Design if it exists, and Architecture requirements into implementable stories.

Input notes: no standalone architecture document exists; `addendum.md` (A1–A5) is used as the architecture source and may be overruled by a later `bmad-architecture` run. No UX design contract exists; UI acceptance criteria derive from PRD FRs and §12 Experience Principles. PRD §3 Glossary terms are used verbatim. Scheduling: all calendar dates and date-based deadlines from the PRD and addendum are dropped by owner decision; epics are sequenced by dependency only.

## Requirements Inventory

### Functional Requirements

FR1 (P0): A Carrier User can create a Claim File with a reference string and receive a unique Claim Link within 2 s. The Claim Link resolves to exactly one Claim File, expires after 14 days by default, and can be revoked; a revoked or expired link shows "This link is no longer active" and accepts no Captures.
FR2 (P0): A Capturer can register a Device Key (passkey) from a Claim Link with a single platform biometric/PIN prompt: ≤ 2 prompts and median ≤ 30 s to a ready capture screen; never funds, approves or signs a ledger transaction or sees a seed phrase/address; a returning Capturer reuses the existing Device Key; unsupported browsers get a specific message naming supported browsers, never a raw error.
FR3 (P0): Captures can only be created from the live camera feed inside Proofshot: no gallery, file picker or paste input; missing camera permission shows guidance to grant it with no alternative input.
FR4 (P0): Each Capture is sealed by verifying the Device Key signature onchain and writing the Capture Record to the Registry. The signed payload binds at minimum Exact Hash, Perceptual Hash, Tile Hashes, Location Commitment, device-claimed timestamp, Claim File reference and latest-block reference. The Registry rejects invalid signatures (automated tampered-payload test) and duplicate Exact Hashes ("already sealed" + UI shows existing Verification Receipt). The Signing Window (referenced block → inclusion block) is recorded and displayed.
FR5 (P1): The capture screen shows each Capture's Seal status live: shutter-to-"Sealed ✓" meets NFR1; pending shows "Sealing…" and remains reviewable; failure shows "Not sealed — retry" and keeps the Capture on device until retried or discarded; up to 10 Captures in a row without waiting for earlier Seals.
FR6 (P0): A Capturer can send sealed Captures (only sealed ones) to the Claim File; the Carrier receives image files that verify as Original; image files are stored only in Carrier-scoped storage, never in the Registry.
FR7 (P0): The system pays all ledger fees for Seals and Imported Records; no Capturer or Carrier User holds or spends a ledger asset; sponsorship is rate-limited per Claim Link (default ≤ 50 Seals) and per Device Key (default ≤ 200/day) with a clear message when exceeded.
FR8 (P0): Anyone can submit an image (JPEG, PNG, WebP, HEIC, ≤ 20 MB) to the Public Verifier and get exactly one Verdict: identical file → Original; WhatsApp/X recompression or resize ≥ 50% width → Derived Copy at the SM2 rate; crop ≤ 10% → Derived Copy with Alteration Check unavailable and the warning "Cropped copy — alteration check not possible. Request the original from the sender." at equal visual weight (never a clean result); no match → No Record, explained as "not sealed with Proofshot," not "fake"; submitted image is not retained unless submitted inside a Claim File.
FR9 (P0): Every Verification and every Capture Record has a Verification Receipt at a stable public URL showing Verdict, seal time, Signing Window, shortened Device Key identifier, Carrier as "a carrier," and a block-explorer link; includes step-by-step independent reproduction instructions plus an open-source script; never shows the image unless the viewer submitted it in the current session.
FR10 (P1): A published CLI script, given an image and a network endpoint, outputs the same Verdict as the Public Verifier for all benchmark-set images, using only public Registry data and the open-source fingerprinting tool.
FR11 (P1, pending Spike A go/no-go): An image matching a Capture Record overall but with Tile Hashes differing beyond threshold returns Altered with a Tile Map: generative edits ≥ 5% area detected at the SM2 rate with the edited region inside a highlighted tile ≥ 90% of the time; recompression alone stays under SM-C1; Tile Map legible at 375 px; Alteration Check runs only when available, so a cropped-and-edited image never gets a clean Derived Copy.
FR12 (P0): The Carrier Console raises a Duplicate Alert when an image in a Claim File matches a Registry entry linked to a different Claim File, labelled "same carrier" or "another carrier," visible within 10 s of the Seal/upload; alerts for another Carrier show no customer data, Claim File reference or image.
FR13 (P1): A Carrier User can bulk-import (folder or zip, up to 500 images) fingerprints of photos received outside Proofshot, creating one Imported Record per image; images are fingerprinted and discarded; matches are always labelled "imported (unsigned)" and never produce a signature-based Original.
FR14 (P0): A Carrier User can open a Claim File and see every Capture, uploaded image, Verdict and Duplicate Alert in one list (thumbnail, Verdict badge, seal time, Verification Receipt link); can upload an image into the Claim File for Verification (retained in Carrier-scoped storage, duplicate checks run); Claim Files are visible only to the owning Carrier's users.
FR15 (P0): Carrier Users sign in to a Carrier-scoped workspace; a Carrier A user cannot read any Claim File, image or Capture of Carrier B via UI or API (automated authorization test); the build ships ≥ 2 seeded demo Carriers. SSO, roles beyond "member" and audit export are out of scope.
FR16 (P2, stretch): A Carrier User can request a weather attestation for a Claim File, written onchain by a decentralized oracle workflow, shown with sources and block-explorer link within 2 min; runs only if the location has been disclosed.
FR17 (P2, stretch): A Carrier User can generate an AI damage summary across a Claim File's Captures, labelled "AI-generated — not a determination," never shown to the Capturer, never affecting any Verdict.
FR18 (P1): Any visitor can start a sandbox Claim File in a public demo Carrier with no sign-up: ≤ 3 taps plus the passkey prompt from the landing page to a ready capture screen; desktop visitors get a QR code; sandbox Captures are sealed on mainnet with the demo Carrier ID (excluded from SM3); a guided "now try to fool it" step follows; FR7 rate limits apply with a friendly limit message.

### NonFunctional Requirements

NFR1 Seal latency: p95 ≤ 3 s from shutter to "Sealed ✓" on 4G; the ledger's inclusion-to-finality contribution measured and reported separately (SM5: over ≥ 100 mainnet Seals, method published).
NFR2 Verification latency: p95 ≤ 3 s for a Public Verifier Verdict with ≤ 10,000 Registry entries, excluding upload.
NFR3 Supported devices: iOS 17+ Safari, Android 13+ Chrome; desktop Chrome/Safari for Console and Public Verifier; capture on mobile only.
NFR4 Availability: demo URL reachable for 99% of checks throughout the judging period, monitored by an external uptime check; relayer balance alert and secondary RPC (R-5).
NFR5 Privacy: the Registry stores only hashes, commitments, identifiers and block references — no image bytes, names, contacts, plates or precise locations; location only as a salted Location Commitment with explicit disclosure; Public Verifier uploads not retained; enforced by the contract interface and code review.
NFR6 Registry correctness: every Registry write path has automated tests including FR4 negative cases; contract source-verified on the public explorer.
NFR7 Accessibility: capture screen and Verdict badges meet WCAG 2.1 AA contrast; Verdicts conveyed by text and icon, never color alone.
NFR8 Language: all product surfaces, generated text, docs, repo content, demo and write-up are English-only; no localization.
NFR9 Invisible ledger (PRD §4.1, §12): Capturer-facing UI never uses "wallet," "gas," "token," "chain" or "transaction"; vocabulary is "photo," "sealed," "sent," "receipt."
NFR10 Cost: sponsored fees for ≤ 5,000 hackathon Seals stay within the builder-confirmed budget (assumption ≤ US$50), confirmed after Spike B.
NFR11 Verification accuracy (SM2 + counter-metrics): Derived Copy recall ≥ 95% for recompression/resize; Altered recall ≥ 80% for edits ≥ 5% area (if FR11 ships); false Altered on recompression-only ≤ 5% (SM-C1); false match on near-duplicate different scenes ≤ 1% (SM-C2); benchmark (≥ 50 Captures × transforms) method and raw results published in the repo.
NFR12 Onchain footprint (SM-C3): the Capture Record must not grow for convenience; contract state holds only sealed[exactHash], Device Keys and Signing Window sanity data; everything else in events.
NFR13 Hackathon rules: all work built within the hackathon window with repository history showing it; submission includes working product, demo, short write-up and code link; runs on Monad mainnet (chain ID 143) with a verified Registry contract.
NFR14 Honest Verdicts (PRD §6, §12): every Verdict states what it means and does not mean; the product never auto-denies or declares fraud.

### Additional Requirements

Source: `addendum.md` (acting architecture). No starter template is specified; Epic 1 Story 1 is a from-scratch project scaffold.

- **Project scaffold (Epic 1 Story 1):** single Next.js (App Router, TypeScript) app hosting Capture PWA, Carrier Console, Public Verifier and server routes (relayer, API), deployed on Vercel; Foundry project for contracts; CI running app and contract tests; environment configuration for testnet and mainnet.
- **Spike A — fingerprint robustness (≤ 1 day):** 50 builder-taken damage-like photos; transforms WhatsApp, X, screenshot, 50% resize, 10% crop, 3 generative inpaint edits each; 50 near-duplicate negatives; outputs distance histograms, chosen `T_match` and `T_tile`, recall/FP table in `benchmark/README.md`.
- **Spike B — onchain passkey verification (≤ 0.5 day):** passkeys on iPhone Safari and Android Chrome; sign a 32-byte challenge; verify in a Foundry fixture test and on Monad testnet; measure `seal()` gas with the full CaptureRecord and shutter-to-event latency; confirm OZ `WebAuthn.verify` signature and `requireUV`; decide relayer-only vs permissionless `seal()`.
- **Go/no-go checkpoint, immediately after Spikes A and B complete (memlog decision):** Spike A pass → FR11 stays P1, else P2 and the claim narrows; Spike B fail → server-side verification + onchain record fallback and honest rewrite of "Why Monad."
- **Registry contract:** Solidity + Foundry using OpenZeppelin `WebAuthn.sol` + `P256.sol` via Monad P256 precompile `0x0100` (EIP-7951); `CaptureRecord` struct (exactHash, pHash, tiles[16], width, height, locCommit, deviceTime, claimRef = keccak(claimFileId), carrierId, refBlock); functions `registerDeviceKey`, `seal`, `importRecords` (relayer-only initially); events `DeviceKeyRegistered`, `CaptureSealed`, `RecordImported`; Signing Window enforced by `block.number - refBlock ≤ MAX_LAG` (~100 blocks); fuzz tests for FR4 negatives; testnet then mainnet deploy with source verification.
- **Fingerprinting library:** Meta PDQ via `pdq-wasm`, one shared module for browser, server and CLI: 256-bit whole-image hash, 16 tile hashes (4×4), SHA-256 Exact Hash; HEIC decoded server-side (e.g. `sharp` + libheif).
- **Verdict algorithm:** exactHash match → Original; else best record by Hamming distance, `d > T_match` (start 31/256) → No Record; any tile `d_i > T_tile` (start ~40/256) → Altered with Tile Map, else Derived Copy; Imported Record matches labelled "imported (unsigned)"; aspect-ratio difference > 2% skips the tile step → Derived Copy with Alteration Check unavailable.
- **Capture client pipeline:** getUserMedia frame → JPEG bytes → hashes; locCommit = H(lat, lon, salt) with salt kept on device and sent to the Carrier; refBlock fetched at capture; payload = abi.encode(...); challenge = sha256(payload); `navigator.credentials.get({challenge})`; POST `/api/seal` → rate limit → relayer tx.
- **Client passkeys:** native WebAuthn, optionally `@simplewebauthn/browser` for parsing; no wallet SDK. Chain client: viem.
- **Relayer:** server route with a MON-funded hot key submitting `seal()` / `registerDeviceKey()` / `importRecords()`; balance alerting.
- **Indexing:** Envio HyperIndex on `CaptureSealed` / `RecordImported` → Postgres (`capture_records`, `imported_records` owned by Envio); Hamming search over indexed data (Envio bounty).
- **App data model (Postgres, Neon or Supabase):** carriers(id, name, pseudonymous_id), users(id, carrier_id, email), claim_files(id, carrier_id, reference, status, created_at), claim_links(token, claim_file_id, expires_at, revoked_at, seal_count), captures(id, claim_file_id, exact_hash, tx_hash, storage_key, loc_salt, sealed_at), uploads(id, claim_file_id, storage_key, verdict, matched_exact_hash), duplicate_alerts(id, claim_file_id, source_exact_hash, matched_exact_hash, same_carrier, distance, created_at), device_keys(key_id, qx, qy, first_seen), rate_limits.
- **Image storage:** Supabase Storage or S3 with Carrier-scoped buckets.
- **Carrier auth:** magic-link email (Supabase Auth or Auth.js).
- **Monitoring:** Better Stack or UptimeRobot on demo URLs; secondary RPC; recorded demo video as backup.
- **Delivery constraints:** no calendar deadlines; work runs continuously epic by epic until the project is complete (owner decision 2026-09-28, overriding the PRD/addendum dates). Order: P0 before P1; P2 (FR16, FR17) starts only after all P0/P1 epics are done; polish, video and write-up come last.
- **Launch/proof work (non-code deliverables tracked as stories):** real-user recruiting as soon as the sandbox is live (SM3 ≥ 20 Device Keys, ≥ 60 Captures), unmoderated onboarding tests (SM4), practitioner conversations (SM6), latency report (SM5), benchmark report (SM2), demo video per A6 script, write-up per A7 outline, submission.

### UX Design Requirements

No UX design contract exists. UI acceptance criteria are derived from PRD FRs, NFR7, NFR9 and §12 Experience Principles (invisible ledger, evidence-grade calm with Verdict colors reserved for Verdicts, honest Verdicts, one-hand capture, anti-references: crypto-wallet onboarding and dense forensic metadata dumps).

### FR Coverage Map

FR1: Epic 2 — Claim File + Claim Link creation, expiry, revocation
FR2: Epic 3 — passkey onboarding without crypto concepts
FR3: Epic 3 — live-camera-only capture
FR4: Epic 3 — onchain-verified Seal (contract in 3.1, client in 3.4)
FR5: Epic 3 — live Seal status, burst capture, retry
FR6: Epic 3 — send sealed Captures to Carrier-scoped storage
FR7: Epic 3 — relayer fee sponsorship + rate limits
FR8: Epic 4 — Public Verifier Verdicts
FR9: Epic 4 — Verification Receipt pages
FR10: Epic 4 — reproducibility CLI
FR11: Epic 4 — Altered Verdict + Tile Map (priority set by Epic 1 go/no-go)
FR12: Epic 5 — Duplicate Alerts (same / another carrier)
FR13: Epic 5 — bulk import of historical fingerprints
FR14: Epic 5 — Claim File evidence view + in-file upload
FR15: Epic 2 — Carrier sign-in and tenancy
FR16: Epic 7 — weather attestation (stretch)
FR17: Epic 7 — AI damage summary (stretch)
FR18: Epic 4 — public try-it sandbox

## Epic List

### Epic 1: Foundations & Go/No-Go Spikes
The builder has a deployable monorepo and measured answers to the two risks that shape every later epic: can PDQ tile hashes localize edits (Spike A), and can Monad verify passkey signatures onchain at acceptable gas/latency (Spike B).
**FRs covered:** none directly; de-risks FR4, FR8, FR11 (NFR1, NFR10, NFR11).

### Epic 2: Carrier Workspace & Claim Links
A Carrier User signs in to an isolated workspace, creates Claim Files and sends Claim Links.
**FRs covered:** FR1, FR15

### Epic 3: Capture & Seal
A Capturer opens a Claim Link, creates a passkey with one biometric prompt, takes live photos that seal onchain in seconds, and sends them to the Carrier — never seeing a crypto concept.
**FRs covered:** FR2, FR3, FR4, FR5, FR6, FR7

### Epic 4: Public Verification & Try-It Sandbox
Anyone can drop any copy of a photo into the Public Verifier and get one honest Verdict with a shareable, independently reproducible Receipt; evaluators can run the whole loop from their own phone.
**FRs covered:** FR8, FR9, FR10, FR11, FR18

### Epic 5: Evidence Review & Cross-Carrier Duplicate Detection
Adjusters see every item and Verdict in a Claim File; investigators get Duplicate Alerts across Carriers without any photo being shared; Carriers get value on day one via imported history.
**FRs covered:** FR12, FR13, FR14

### Epic 6: Proof & Launch
Judges see measured evidence (benchmark, latency, real users) and a polished, monitored, submitted product.
**FRs covered:** none directly; closes NFR1, NFR4, NFR11, NFR13 and SM-1…SM-6.

### Epic 7: Stretch — Bounty Add-ons
Only after all P0/P1 work is done.
**FRs covered:** FR16, FR17

---

## Cross-Cutting Conventions (apply to every story)

- **Repo layout (pnpm workspaces):** `apps/web` (Next.js App Router, TS — Capture PWA, Carrier Console, Public Verifier, API routes), `packages/fingerprint` (PDQ + SHA-256 + tiles + Verdict engine; runs in browser, Node and CLI), `packages/shared` (types, ABI, constants), `contracts` (Foundry), `indexer` (Envio HyperIndex), `cli` (FR10), `benchmark` (Spike A + SM-2).
- **Definition of Done:** code merged on `main` with passing CI (typecheck, lint, unit tests, `forge test`); Glossary vocabulary used verbatim; English-only copy (NFR8); no crypto vocabulary on Capturer surfaces (NFR9); no image bytes or PII reach the Registry (NFR5).
- **Config:** all network-specific values (RPC URLs, chain ID, Registry address, relayer key, DB URL, storage keys, `T_match`, `T_tile`, `MAX_LAG`, rate limits) come from typed env config in `packages/shared`; testnet and mainnet are selected by one variable.

## Epic 1: Foundations & Go/No-Go Spikes

The builder has a deployable monorepo and measured answers to the two risks that shape every later epic.

### Story 1.1: Monorepo scaffold, CI and deploy skeleton

As the builder,
I want a working monorepo with CI and a live deploy,
So that every later story lands on a tested, deployable base.

**Acceptance Criteria:**

**Given** a fresh clone
**When** I run `pnpm install && pnpm build && pnpm test`
**Then** all workspaces (`apps/web`, `packages/fingerprint`, `packages/shared`, `cli`) build and their placeholder tests pass
**And** `forge build && forge test` passes in `contracts/`

**Given** a push to `main`
**When** CI runs
**Then** typecheck, lint, unit tests and `forge test` all run and must pass

**Given** the Next.js app
**When** deployed to Vercel
**Then** `/` renders a landing placeholder and `/api/health` returns `{ ok: true, network }`
**And** env config is validated at boot with a typed schema that fails fast on missing values

### Story 1.2: Shared fingerprint module (PDQ, tiles, Exact Hash)

As the builder,
I want one fingerprinting module usable in browser, server and CLI,
So that every Verdict is computed by identical code (FR10).

**Acceptance Criteria:**

**Given** an image (JPEG/PNG/WebP bytes or decoded RGBA)
**When** `fingerprint(image)` runs
**Then** it returns `{ exactHash: bytes32 (SHA-256 of original bytes), pHash: bytes32 (PDQ 256-bit), tiles: bytes32[16] (PDQ of a 4×4 grid, row-major), width, height, quality }`
**And** identical decoded pixels yield byte-identical output in Node and browser (one vendored PDQ binary); decoder-level differences between browser and libvips JPEG decoding are measured in Spike A

**Given** two fingerprints
**When** `hamming(a, b)` runs
**Then** it returns the bit distance (0–256), covered by unit tests with known vectors

### Story 1.3: Spike A — fingerprint robustness benchmark v0

As the builder,
I want measured distance distributions on realistic transforms,
So that `T_match`/`T_tile` are chosen from data and FR11's priority is decided honestly.

**Acceptance Criteria:**

**Given** ≥ 50 damage-like source photos, their transforms (WhatsApp, X, screenshot, 50% resize, 10% crop, ≥ 3 generative inpaint edits each) and ≥ 50 near-duplicate negatives under `benchmark/data/` (gitignored, manifest committed)
**When** `pnpm --filter benchmark run` executes
**Then** it writes full-hash and per-tile distance histograms (Story 1.2 probe: a ~6% area edit moved the whole-image pHash 38 bits, above the initial `T_match` 31 — the match step must be evaluated for tile-majority matching, not only whole-hash distance), the chosen `T_match` and `T_tile`, and a recall / false-positive table to `benchmark/README.md`
**And** the table reports Derived Copy recall, Altered recall, SM-C1 and SM-C2 against the NFR11 targets

**Given** the Story 4.2 finding that whole-image PDQ matches crops only up to ~2–3% (synthetic scenes: 5% → 48–74 bits, 10% → 82–96 bits)
**When** the benchmark measures the 10% crop transform on real photos
**Then** it either confirms FR-8's ≤ 10% crop target is met, or evaluates adding a crop-robust centre hash (PDQ of the central 80%, matched by a window search over the submitted image) to the CaptureRecord before mainnet deploy, or narrows FR-8 to the measured crop tolerance

**Given** the results
**When** the go/no-go is logged in `.memlog.md`
**Then** FR11 is recorded as P1 (targets met) or P2 (missed, product claim narrowed), and chosen thresholds are committed to shared config

### Story 1.4: Spike B — onchain passkey verification on Monad testnet

As the builder,
I want a real passkey signature verified by a contract on Monad testnet,
So that the onchain-signature design (FR4) is confirmed or the fallback is triggered early.

**Acceptance Criteria:**

**Given** a passkey registered on iPhone Safari and on Android Chrome via a throwaway page
**When** it signs a 32-byte challenge
**Then** the assertion is captured as a Foundry fixture and `WebAuthn.verify` (OpenZeppelin, P256 precompile `0x0100`) returns true in `forge test`, and false for a tampered challenge

**Given** a spike contract deployed to Monad testnet
**When** the relayer submits the fixture with a full-size CaptureRecord
**Then** gas used, shutter-to-event latency (≥ 10 samples) and the confirmed OZ API (`verify` signature, `requireUV`) are recorded in `docs/spikes/spike-b.md`
**And** the go/no-go (onchain verify vs server-side fallback; relayer-only vs permissionless `seal()`) is logged in `.memlog.md`

## Epic 2: Carrier Workspace & Claim Links

### Story 2.1: Data model, migrations and seeded Carriers

As the builder,
I want the app database schema and two seeded demo Carriers,
So that tenancy-scoped features have a foundation.

**Acceptance Criteria:**

**Given** an empty Postgres database
**When** migrations and seed run
**Then** tables `carriers, users, claim_files, claim_links, captures, uploads, duplicate_alerts, device_keys, rate_limits` exist per addendum A3
**And** two demo Carriers ("Northwind Mutual", "Harbor Insurance") plus a public sandbox Carrier exist, each with a random 32-byte `pseudonymous_id`, and one demo user each

### Story 2.2: Carrier sign-in and tenant isolation

As a Carrier User,
I want to sign in with a magic link to my Carrier's workspace,
So that I only ever see my Carrier's data.

**Acceptance Criteria:**

**Given** a registered Carrier User email
**When** they request and open a magic link
**Then** they land in `/console` scoped to their Carrier; unknown emails receive no link and no account-existence hint

**Given** a signed-in user of Carrier A
**When** they request any Claim File, Capture, upload or image of Carrier B via UI route or API (by ID guessing)
**Then** the response is 404, proven by an automated authorization test covering every console API route
**And** all console data access goes through one tenant-scoped data-access layer

### Story 2.3: Create Claim File and Claim Link; expiry and revocation

As a Carrier User,
I want to create a Claim File and get a Claim Link I can send,
So that the policyholder can add evidence to exactly this claim.

**Acceptance Criteria:**

**Given** a signed-in Carrier User
**When** they submit a reference string
**Then** a Claim File is created and a unique Claim Link (≥ 128-bit random token) is shown with a copy button within 2 s
**And** the link expires after 14 days by default

**Given** a Claim Link
**When** the Carrier User revokes it, or it has expired
**Then** opening it shows "This link is no longer active" and every capture/seal API call bearing the token is rejected

**Given** the console home
**When** the Carrier User opens it
**Then** they see their Claim Files with reference, status ("Awaiting evidence" / "Evidence received") and created date

## Epic 3: Capture & Seal

### Story 3.1: Registry contract with full test suite

As the builder,
I want the production Registry contract,
So that Seals and Imported Records are verified and recorded onchain (FR4, NFR6, NFR12).

**Acceptance Criteria:**

**Given** the `CaptureRecord` struct, `registerDeviceKey`, `seal`, `importRecords` and events from addendum A2 (adjusted by Spike B findings)
**When** `seal` is called with a valid WebAuthn assertion over `sha256(abi.encode(record))`
**Then** `CaptureSealed` is emitted with all record fields and `sealed[exactHash]` is set

**Given** a tampered payload, an unregistered key, a duplicate `exactHash`, or `block.number - refBlock > MAX_LAG`
**When** `seal` is called
**Then** it reverts with a distinct custom error for each case (covered by unit and fuzz tests)
**And** only the relayer role may call write functions (or, if Spike B chose permissionless, the test suite proves spam cannot bypass signature checks)

**Given** the contract passes tests
**When** the deploy script runs against testnet, then mainnet (chain 143)
**Then** the address is written to shared config and the source is verified on the explorer

### Story 3.2: Claim Link landing and passkey onboarding

As a Capturer,
I want to open the link and be ready to shoot after one Face ID prompt,
So that sealing evidence feels like taking a photo, not using crypto (FR2, NFR9).

**Acceptance Criteria:**

**Given** a valid Claim Link opened on iOS 17+ Safari or Android 13+ Chrome
**When** the page loads
**Then** it shows the Carrier name, claim reference and "Take photos of the damage"

**Given** a first-time Capturer
**When** they tap "Continue"
**Then** one platform passkey prompt creates a Device Key; the server extracts `(qx, qy)`, stores it and the relayer calls `registerDeviceKey`; the capture screen is ready in ≤ 2 prompts
**And** a returning Capturer on the same device authenticates with the existing Device Key

**Given** an unsupported browser or WebAuthn failure
**When** onboarding runs
**Then** a specific message names the supported browsers; no raw error, and no "wallet/gas/token/chain/transaction" wording anywhere

### Story 3.3: Live-camera capture screen

As a Capturer,
I want a one-hand camera screen that only takes live photos,
So that evidence can't be swapped for an older image (FR3).

**Acceptance Criteria:**

**Given** camera permission granted
**When** the capture screen opens
**Then** it shows a full-screen rear-camera `getUserMedia` preview with a thumb-reachable shutter, and offers no gallery, file picker, drag-drop or paste input

**Given** camera permission is denied or unavailable
**When** the Capturer reaches capture
**Then** guidance to grant permission is shown, with no alternative input

**Given** the shutter is tapped
**When** a frame is captured
**Then** full-resolution JPEG bytes are produced and fingerprinted on-device with `packages/fingerprint`

### Story 3.4: Sign and seal a Capture via the relayer

As a Capturer,
I want each photo sealed with my Device Key at the moment I take it,
So that anyone can later prove when it was taken and that it is unchanged (FR4, FR7).

**Acceptance Criteria:**

**Given** a captured frame
**When** sealing starts
**Then** the client builds the CaptureRecord (hashes, width/height, `locCommit = keccak(lat, lon, salt)` or zero if location is denied, device time, `claimRef = keccak(claimFileId)`, carrierId, latest `refBlock`), asks for one WebAuthn assertion over `sha256(abi.encode(record))`, and POSTs `/api/seal`

**Given** `/api/seal` receives a request
**When** the Claim Link is invalid, or per-link (50) or per-key (200/day) limits are exceeded
**Then** it rejects with a clear, Capturer-safe message and submits nothing

**Given** a valid request
**When** the relayer submits `seal()`
**Then** the API returns the tx hash and inclusion block after inclusion; a `captures` row is stored with `exact_hash`, `tx_hash`, `loc_salt`, `sealed_at`
**And** an "already sealed" revert returns the existing Verification Receipt URL

### Story 3.5: Live Seal status, burst capture and retry

As a Capturer,
I want to keep shooting while earlier photos seal,
So that capture is fast and failures are recoverable (FR5, NFR1).

**Acceptance Criteria:**

**Given** the capture screen
**When** the Capturer takes up to 10 photos in a row
**Then** each thumbnail shows "Sealing…" then "Sealed ✓ · 0.x s" (shutter-to-confirmation time) without blocking the shutter

**Given** a Seal fails
**When** the error returns
**Then** the thumbnail shows "Not sealed — retry"; the Capture stays in IndexedDB until retried or discarded

**Given** any Seal
**When** it completes
**Then** timing marks (shutter, signed, submitted, included) are logged for the SM-5 latency report

### Story 3.6: Send sealed Captures to the Carrier

As a Capturer,
I want to send my sealed photos to my insurer and keep receipt links,
So that my claim moves forward with proof I own (FR6).

**Acceptance Criteria:**

**Given** one or more sealed Captures
**When** the Capturer taps "Send to insurer"
**Then** only sealed Captures upload (original JPEG bytes, unmodified) to the Carrier-scoped bucket; unsealed ones are excluded with a note
**And** the Claim File status becomes "Evidence received"

**Given** a sent Capture
**When** the Carrier later verifies the stored file
**Then** the Verdict is Original (exact bytes preserved end-to-end, asserted by an integration test)

**Given** sending completes
**When** the confirmation screen shows
**Then** each photo has a green Seal badge, its timestamp and a Verification Receipt link

## Epic 4: Public Verification & Try-It Sandbox

### Story 4.1: Envio indexer for Registry events

As the builder,
I want Registry events indexed into Postgres,
So that Verification can search fingerprints fast (NFR2).

**Acceptance Criteria:**

**Given** the deployed Registry
**When** the Envio indexer runs (local and hosted)
**Then** every `CaptureSealed` and `RecordImported` event appears in `capture_records` / `imported_records` with all fields plus block number, timestamp and tx hash, within 5 s of inclusion

### Story 4.2: Verdict engine

As the builder,
I want one Verdict function shared by Verifier, Console and CLI,
So that every surface returns the same answer (FR8, FR11).

**Acceptance Criteria:**

**Given** a submitted fingerprint and a candidate-record source
**When** `computeVerdict` runs
**Then** it applies addendum A2 exactly: Exact Hash → Original; best pHash match above `T_match` → No Record; aspect ratio differs > 2% → Derived Copy with Alteration Check unavailable; any tile > `T_tile` → Altered with tile indices; else Derived Copy; Imported Record matches carry "imported (unsigned)" and are never Original
**And** unit tests cover each branch, including crop+edit never producing a clean Derived Copy

**Given** ≤ 10,000 indexed records
**When** a nearest-match search runs
**Then** p95 search time is ≤ 1 s (benchmark test)

### Story 4.3: Public Verifier page

As anyone holding a copy of a claim photo,
I want to drop it in and get one clear Verdict,
So that I can trust or question it without an account (FR8, NFR7, NFR14).

**Acceptance Criteria:**

**Given** a JPEG, PNG, WebP or HEIC ≤ 20 MB
**When** dropped on `/verify`
**Then** it is fingerprinted (HEIC decoded server-side), not retained, and exactly one Verdict is shown within NFR2 with text + icon (never color alone)

**Given** each Verdict type
**When** displayed
**Then** it states what it means and does not mean: No Record = "not sealed with Proofshot," not "fake"; a crop shows "Cropped copy — alteration check not possible. Request the original from the sender." at the Verdict's visual weight
**And** unsupported types or oversize files get a specific message

### Story 4.4: Tile Map for Altered Verdicts

As an adjuster or third party,
I want to see where an image was changed,
So that alterations are obvious at a glance (FR11).

**Acceptance Criteria:**

**Given** an Altered Verdict
**When** shown
**Then** the submitted image renders with a 4×4 overlay highlighting tiles above threshold, legible at 375 px width, with a text summary ("2 of 16 regions differ from the sealed photo")
**And** if Spike A downgraded FR11 to P2, this story is deferred and Altered is not shown

### Story 4.5: Verification Receipt pages

As a Capturer, adjuster or third party,
I want a stable public receipt,
So that anyone can re-check the proof later (FR9).

**Acceptance Criteria:**

**Given** a Capture Record or a Verification
**When** `/r/{exactHash}` or `/v/{verificationId}` is opened
**Then** it shows Verdict, seal time, Signing Window (ref block → inclusion block, with times), shortened Device Key ID, "a carrier," and an explorer link to the tx
**And** the image is never shown unless the viewer submitted it in this session
**And** a "Verify it yourself" section gives step-by-step reproduction instructions and the CLI command

### Story 4.6: Reproducibility CLI

As a technical third party,
I want to reproduce a Verdict from public data only,
So that I don't have to trust Proofshot's servers (FR10).

**Acceptance Criteria:**

**Given** an image path and an RPC endpoint
**When** `npx proofshot-verify <image> --rpc <url> [--registry <addr>]` runs
**Then** it fingerprints locally, reads Registry events directly from the chain (no Proofshot API), and prints the same Verdict as the Public Verifier
**And** a CI test asserts CLI and Verifier Verdicts are equal for the benchmark set

### Story 4.7: Public try-it sandbox

As a judge or curious visitor,
I want to run the full seal-and-verify loop from my phone in under two minutes,
So that I experience the proof instead of reading about it (FR18).

**Acceptance Criteria:**

**Given** the landing page on mobile
**When** the visitor taps "Try it"
**Then** a sandbox Claim File in the public sandbox Carrier is created and the capture screen is ready in ≤ 3 taps plus the passkey prompt; on desktop a QR code continues on the phone

**Given** a sealed sandbox Capture
**When** sealing completes
**Then** a guided "Now try to fool it" step explains: download, edit or recompress, and drop into the Public Verifier
**And** sandbox Captures carry the sandbox Carrier ID and share FR7 limits with a friendly limit message

## Epic 5: Evidence Review & Cross-Carrier Duplicate Detection

### Story 5.1: Claim File evidence view with in-file upload

As an adjuster,
I want every item in a claim with its Verdict in one list,
So that I can fast-track honest claims and escalate the rest (FR14).

**Acceptance Criteria:**

**Given** a Claim File with Captures and uploads
**When** a Carrier User opens it
**Then** each item shows thumbnail (signed URL from Carrier-scoped storage), Verdict badge, seal time and Receipt link

**Given** an image received by email
**When** the Carrier User uploads it into the Claim File
**Then** it is stored in Carrier-scoped storage, verified with the shared Verdict engine, listed with its Verdict (Altered shows the Tile Map), and duplicate checks run on it

### Story 5.2: Duplicate Alerts

As an SIU investigator,
I want to be alerted when evidence already exists in another claim,
So that I catch recycled photos across carriers without sharing data (FR12).

**Acceptance Criteria:**

**Given** a new Capture sealed or an image uploaded into a Claim File
**When** its pHash matches (≤ `T_match`) a Registry entry whose `claimRef` differs
**Then** a Duplicate Alert appears in the Claim File within 10 s, labelled "same carrier" or "another carrier," showing match strength and seal date

**Given** an "another carrier" alert
**When** displayed or fetched via API
**Then** it contains no customer data, Claim File reference or image from that Carrier (asserted by test)

### Story 5.3: Import historical fingerprints

As a Carrier User,
I want to import fingerprints of past claim photos,
So that duplicate detection works before any policyholder uses Proofshot (FR13).

**Acceptance Criteria:**

**Given** a folder or zip of up to 500 images
**When** uploaded in the Console
**Then** each is fingerprinted and discarded (never stored), and the relayer writes them via batched `importRecords()` calls with progress shown

**Given** a later match against an Imported Record
**When** shown anywhere
**Then** it is labelled "imported (unsigned)" and never yields Original

## Epic 6: Proof & Launch

### Story 6.1: Reliability and monitoring

As the builder,
I want the demo to stay up through judging,
So that judges never hit a broken product (NFR4, R-5).

**Acceptance Criteria:**

**Given** production
**When** monitoring is configured
**Then** an external uptime check covers `/`, `/verify` and `/api/health`; relayer MON balance below threshold triggers an alert; a secondary RPC is used on primary failure

### Story 6.2: Benchmark and latency reports

As a judge,
I want published, reproducible numbers,
So that accuracy and speed claims are credible (SM-2, SM-5, NFR1, NFR11).

**Acceptance Criteria:**

**Given** the final thresholds and ≥ 50 sealed Captures × transforms
**When** the benchmark runs through the CLI
**Then** `benchmark/README.md` publishes method, raw results, recall and counter-metrics
**And** `docs/latency.md` publishes p95 shutter-to-"Sealed ✓" over ≥ 100 mainnet Seals with ledger contribution separated, plus measured gas per Seal

### Story 6.3: Real-user drive and onboarding tests

As the builder,
I want real people sealing real photos,
So that traction and onboarding claims are measured (SM-3, SM-4, SM-6).

**Acceptance Criteria:**

**Given** the live sandbox
**When** the recruiting drive runs
**Then** distinct Device Keys and non-builder Captures on mainnet are counted by a script (excluding builder keys, SM-C4), and ≥ 5 unmoderated onboarding test results are recorded in `docs/traction.md`
**And** targets are the PRD's (≥ 20 keys, ≥ 60 Captures); shortfalls are reported honestly, not padded

### Story 6.4: Demo video, write-up and submission

As a judge,
I want a tight demo and write-up,
So that I understand the product and its proof in three minutes (SM-1, NFR13).

**Acceptance Criteria:**

**Given** the product on mainnet
**When** the demo is recorded per addendum A6
**Then** UJ-1 → UJ-4 → UJ-2 → UJ-3 run live in one unedited take

**Given** the write-up per addendum A7
**When** submitted
**Then** it includes the §9 threat model verbatim, measured numbers, contract address, repo link and reproduction steps; the root `README.md` matches

## Epic 7: Stretch — Bounty Add-ons

Only after Epics 1–6 are complete.

### Story 7.1: Weather attestation (FR16)

As an adjuster on a hail claim,
I want an independent onchain weather attestation,
So that the claimed event is corroborated.

**Acceptance Criteria:**

**Given** a Claim File with a disclosed location
**When** the Carrier User requests an attestation
**Then** a Chainlink CRE workflow writes an onchain attestation, shown in the Claim File with sources and explorer link within 2 minutes; the button is disabled without a disclosed location

### Story 7.2: AI damage summary (FR17)

As an adjuster,
I want a short summary of visible damage across Captures,
So that I triage faster.

**Acceptance Criteria:**

**Given** a Claim File with Captures
**When** the Carrier User clicks "Summarize damage"
**Then** a Qwen-VL summary appears labelled "AI-generated — not a determination," is never shown to the Capturer and never affects any Verdict
