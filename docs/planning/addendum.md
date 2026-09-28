---
title: Proofshot — PRD Addendum
status: draft
created: 2026-09-28
updated: 2026-09-28
---

# Addendum: Proofshot

*Technical direction, delivery plan and supporting depth that feed `bmad-architecture` and `bmad-create-epics-and-stories`. The PRD (`prd.md`) is authoritative on **what**. This file proposes **how**. The architect may overrule anything here, with a logged reason.*

## A1. Proposed Stack

| Concern | Proposal | Why |
|---|---|---|
| App (Capture PWA, Carrier Console, Public Verifier) | One Next.js (App Router, TypeScript) app, deployed on Vercel | Solo builder, single deploy, server routes for relayer and API |
| Contracts | Solidity + Foundry | Fast tests, fuzzing for FR-4 negatives |
| Passkey verification onchain | OpenZeppelin `WebAuthn.sol` + `P256.sol`, which call Monad's P256 precompile at `0x0100` (EIP-7951, 6,900 gas) | Audited library; the precompile keeps verification cheap |
| Client passkeys | Native WebAuthn (`navigator.credentials`), optionally via `@simplewebauthn/browser` for parsing | No wallet SDK needed; FR-2 forbids wallet concepts |
| Chain client | viem | Typed, light |
| Fingerprints | Meta PDQ via `pdq-wasm` (browser + Node): 256-bit whole-image hash + 16 tile hashes (4×4 grid) + SHA-256 Exact Hash | Industry-proven for recompression robustness; same code in browser, server and CLI (FR-10) |
| Indexing | Envio HyperIndex on `CaptureSealed` / `RecordImported` events → Postgres | Fast Hamming search; Envio bounty |
| App data | Postgres (Neon or Supabase) for Carriers, users, Claim Files, Claim Links and rate limits | Tenancy (FR-15) |
| Image storage | Supabase Storage or S3, Carrier-scoped buckets | FR-6, NFR-5 |
| Carrier auth | Magic-link email auth (Supabase Auth or Auth.js) | Minimal; SSO is out of scope |
| Relayer | A server route holding a hot key funded with MON; submits `seal()` / `importRecords()` | FR-7 gasless |
| Monitoring | Better Stack or UptimeRobot on the demo URLs | NFR-4 |

## A2. Architecture Sketch

```
Capturer phone (PWA)                         Server (Next.js routes)                     Monad
───────────────────                          ───────────────────────                     ─────
getUserMedia frame ─► JPEG bytes
  ├─ SHA-256          → exactHash
  ├─ PDQ(full)        → pHash (bytes32)
  ├─ PDQ(4×4 tiles)   → tiles[16] (bytes32)
  ├─ locCommit = H(lat,lon,salt)  (salt kept on device + sent to Carrier)
  └─ refBlock = latest block number+hash (fetched at capture)
payload = abi.encode(exactHash,pHash,tiles,locCommit,deviceTime,claimRef,refBlock)
challenge = sha256(payload)
navigator.credentials.get({challenge}) ─► WebAuthn assertion
POST /api/seal {payload, assertion, keyId} ─► rate-limit (FR-7) ─► relayer tx ─► Registry.seal()
                                                                                  ├─ WebAuthn.verify(challenge, auth, qx, qy)
                                                                                  ├─ require(!sealed[exactHash])
                                                                                  ├─ require(refBlock within N blocks)
                                                                                  └─ emit CaptureSealed(...)
POST /api/claim-files/:id/captures (image bytes) ─► Carrier bucket                Envio indexes events ─► Postgres
                                                                                        │
Public Verifier / Console upload ─► fingerprint (same code) ─► Hamming search ◄─────────┘
                                   ─► Verdict + Receipt (links to tx / event)
```

### Contract interface (draft)

```solidity
struct CaptureRecord {
    bytes32 exactHash;
    bytes32 pHash;
    bytes32[16] tiles;
    uint32  width;          // pixels; needed for the Alteration Check (crop detection)
    uint32  height;
    bytes32 locCommit;
    uint64  deviceTime;
    bytes32 claimRef;       // keccak(claimFileId) — opaque, not the carrier's reference string
    bytes32 carrierId;      // pseudonymous
    uint64  refBlock;       // lower bound of Signing Window
}

function registerDeviceKey(bytes32 keyId, bytes32 qx, bytes32 qy) external;      // relayer-only
function seal(bytes32 keyId, CaptureRecord calldata r, WebAuthn.WebAuthnAuth calldata auth) external; // relayer-only
function importRecords(bytes32 carrierId, bytes32[] calldata exactHashes, bytes32[] calldata pHashes) external; // relayer-only

event DeviceKeyRegistered(bytes32 indexed keyId, bytes32 qx, bytes32 qy);
event CaptureSealed(bytes32 indexed exactHash, bytes32 indexed keyId, bytes32 indexed carrierId,
                    bytes32 pHash, bytes32[16] tiles, bytes32 locCommit, bytes32 claimRef,
                    uint64 deviceTime, uint64 refBlock);
event RecordImported(bytes32 indexed exactHash, bytes32 indexed carrierId, bytes32 pHash);
```

- **Keep state minimal.** Contract state holds only `sealed[exactHash]`, the device keys and `refBlock` sanity data. Everything else lives in events (SM-C3, cheaper gas).
- **Signing Window.** The contract requires `block.number - r.refBlock ≤ MAX_LAG` (for example 100 blocks ≈ 30 s). The inclusion block comes from the event.
- **Access control.** Relayer-only writes remove spam; the signature check still guarantees Capturer authorship. Confirm in Spike B whether `seal()` should instead be permissionless (a stronger decentralization story) with the relayer merely sponsoring fees.
- Confirm the exact OZ `WebAuthn.verify` signature and the `requireUV` flag against the installed OZ version in Spike B.

### Verdict algorithm (initial thresholds; to be tuned in Spike A)
1. If `exactHash` matches a record, the Verdict is **Original**.
2. Otherwise, find the best record by Hamming distance `d(pHash)`. If `d > T_match` (start at 31/256, PDQ's customary threshold), the Verdict is **No Record**.
3. For each tile `i`, compute `d_i`. If any `d_i > T_tile` (tune; start ~ 40/256), the Verdict is **Altered**, and the tiles above threshold form the Tile Map. Otherwise, the Verdict is **Derived Copy**.
4. A match whose best record is a `RecordImported` gets the "imported (unsigned)" label.
5. Crop handling: if the submitted aspect ratio differs from the record's `width/height` by more than 2%, skip step 3 and return **Derived Copy** with the Alteration Check *unavailable* (PRD FR-8, FR-11). Crops larger than about 10% typically fall to No Record, which is acceptable and documented.
6. HEIC input on the Public Verifier is decoded server-side (for example with `sharp` + libheif) before fingerprinting.

## A3. Data Model (app DB)
`carriers(id, name, pseudonymous_id)` · `users(id, carrier_id, email)` · `claim_files(id, carrier_id, reference, status, created_at)` · `claim_links(token, claim_file_id, expires_at, revoked_at, seal_count)` · `captures(id, claim_file_id, exact_hash, tx_hash, storage_key, loc_salt, sealed_at)` · `uploads(id, claim_file_id, storage_key, verdict, matched_exact_hash)` · `duplicate_alerts(id, claim_file_id, source_exact_hash, matched_exact_hash, same_carrier, distance, created_at)` · `device_keys(key_id, qx, qy, first_seen)` · `rate_limits(...)`.

The indexer tables (`capture_records`, `imported_records`) are owned by Envio.

## A4. Delivery Plan (seed for `bmad-create-epics-and-stories`)

| Epic | Scope (FRs) | Days | Dates |
|---|---|---|---|
| **E1 Foundations & Spikes** | Repo, CI, env, deploy skeleton; Spike A (fingerprint benchmark v0); Spike B (WebAuthn onchain verify + gas on testnet) | 1–2 | 09-28 → 09-29 |
| **E2 Registry** | Contract, Foundry tests (incl. FR-4 negatives, fuzz), mainnet deploy + verify | 3 | 09-30 |
| **E3 Capture PWA** | FR-1 (link side), FR-2, FR-3, FR-4 (client), FR-5, FR-6, FR-7 | 4–5 | 10-01 → 10-02 |
| **E4 Verification** | Envio indexer, Verdict engine, FR-8, FR-9, FR-11, FR-10 CLI, FR-18 sandbox | 6–7 | 10-03 → 10-04 |
| **E5 Carrier Console** | FR-1 (console side), FR-12, FR-13, FR-14, FR-15, seeded Carriers | 8–9 | 10-05 → 10-06 |
| **E6 Proof & Launch** | Real-user drive (SM-3, SM-4), practitioner calls (SM-6), benchmark report (SM-2), latency report (SM-5), polish, demo video, write-up, submission | 10–15 | 10-07 → 10-12 |
| **E7 Stretch** | FR-16 (Chainlink CRE weather), FR-17 (Qwen-VL summary) | only if E1–E5 are done by 10-08 | — |

**Go / no-go checkpoint, 2026-09-29 evening** (logs a memlog decision):
- If Spike A meets SM-2 thresholds, FR-11 stays P1.
- If Spike A misses, FR-11 moves to P2, and the product claim narrows to Original, Derived Copy and duplicate detection.
- If Spike B fails onchain WebAuthn verification, fall back to server-side verification plus an onchain record, and rewrite the "Why Monad" section honestly.

**Daily rule:** no new feature starts after 2026-10-09. From 10-10 onward it is polish, video and write-up only.

## A5. Spike Definitions

**Spike A: fingerprint robustness (≤ 1 day)**
- Dataset: 50 real damage-like photos (cars, walls, windows) taken by the builder.
- Transforms: WhatsApp send/receive, X upload/download, screenshot, 50% resize, 10% crop, 3 generative inpaint edits per photo (add dent, remove crack, add water stain).
- Negatives: 50 near-duplicate *different* scenes (same car model, same room type).
- Output: distance histograms for full and tile hashes; chosen `T_match` and `T_tile`; recall and false-positive table. The table ships in the repo as `benchmark/README.md` (SM-2).

**Spike B: onchain passkey verification (≤ 0.5 day)**
- Register a passkey on iPhone Safari and Android Chrome. Sign a 32-byte challenge. Verify it in a Foundry test with a fixture, then on Monad testnet via a deployed contract.
- Measure gas for `seal()` with the full CaptureRecord, and end-to-end latency (shutter → event observed).
- Output: gas number, latency numbers, confirmed OZ API. Resolves OQ-2.

## A6. Demo Script (≤ 3 min, one unedited take for the live parts)
1. **0:00–0:20 Hook.** Two damage photos: one real, one AI-edited. "Which is fake? 99% of insurers have already faced this question."
2. **0:20–0:50 UJ-1.** Phone opens a Claim Link, one Face ID prompt, 3 shots, each "Sealed ✓ · 0.x s." No crypto words.
3. **0:50–1:25 UJ-4.** Send one photo to yourself via WhatsApp, drop the compressed copy into the Public Verifier: **Derived Copy**, with the seal time.
4. **1:25–1:55 UJ-2.** Inpaint a dent into the same photo and verify it: **Altered**, with the Tile Map lighting up the edited region.
5. **1:55–2:25 UJ-3.** Switch to Carrier B's Console and file the same photo: **Duplicate Alert, another carrier, sealed 2 Oct.** "They never shared a single photo."
6. **2:25–3:00 Close.** Mainnet numbers (Seals, Device Keys, p95 latency, gas per Seal, benchmark recall), then the one-liner and the roadmap (hardware attestation).

## A7. Submission Write-up Outline
1. Problem (numbers, with sources) · 2. What Proofshot proves and does not prove (§9 of the PRD, verbatim) · 3. Why onchain (the cross-carrier registry) · 4. Why Monad (P256 precompile, 300 ms / 600 ms, per-photo economics, with *measured* numbers) · 5. Demo video · 6. Traction (SM-3, SM-4, SM-6 quotes) · 7. Benchmark (SM-2) · 8. Business model (per-verified-Claim-File fee to Carriers; free to Capturers; Imported Records as the cold-start) · 9. Roadmap (hardware attestation → claims-system connectors → consortium governance) · 10. Contract address, repo, how to reproduce a Verdict (FR-10).

## A8. Competitive Landscape

| | What it does | Gap Proofshot fills |
|---|---|---|
| **Verisk Digital Media Forensics + ClaimSearch** | Post-hoc manipulation, internet-sourced and cross-carrier duplicate detection over ClaimSearch (1.8B claims, 2,800+ contributors, 1M+ images/day). **The closest functional incumbent.** | Images pooled with one vendor; subscribers only; no proof at capture; nothing the policyholder or a third party can verify; US-centric |
| **Attestiv** | Fingerprints claim media, anchors fingerprints on Algorand, AI tamper analysis, duplicate/reuse checks; sold via Duck Creek and BPO partners | Verification runs inside Attestiv's platform; anchoring ≠ independent verification of a recompressed copy; device signature not verified onchain |
| **Truepic** (Controlled Capture, Vision) | Closed SDK; captures verified in Truepic's platform; strong in insurance | Verification lives in the vendor's database; recompressed copies are not independently verifiable |
| **C2PA / Content Credentials** | Open manifest standard embedded in files | Manifests stripped in transit (effectively always on major platforms); no duplicate detection |
| **Nodle Click** | Consumer camera app: C2PA credentials plus an onchain proof and a recent block header for creation time | Consumer and creator focus; relies on embedded metadata that is stripped in transit; no claims workflow or cross-carrier checks |
| **Numbers Protocol** | Blockchain registration of digital assets for creators and media | Creator and asset-registration focus; no claims workflow or cross-carrier duplicate alerts |
| **Vaarhaft and other forensic detectors** | Post-hoc AI and forensic detection of manipulated or reused images | Probabilistic, after the fact; complementary |
| **Metropolis field** (public repos, re-scanned 2026-09-28) | 10+ agent trust/identity projects in Track 04; no provenance, photo, insurance or authenticity projects found | Differentiation within the track |

## A9. Bounty Alignment
| Bounty | Fit | Evidence to include |
|---|---|---|
| Grand Champion ($25k) / Track 04 ($10k) | Core | Whole submission |
| Monad Foundation: passkey features ($2.5k) | Core (FR-2, FR-4) | Onchain P256 verification; gas numbers |
| Envio: best use ($1k) + Cloud | Core (A1 indexing) | Indexer config in repo; Hamming search on indexed data |
| Chainlink: best CRE workflow ($3k) | Stretch (FR-16) | Workflow code + onchain attestation tx |
| Alibaba Cloud Qwen ($5k credits) | Stretch (FR-17) | Summary feature using Qwen-VL |

Always confirm the exact bounty criteria in the hackathon portal before building a stretch feature.

## A10. Rejected Alternatives
- **Native iOS/Android app now:** it enables hardware attestation (T-1), but costs about 5 of 15 days. Deferred to v2.
- **Images on IPFS or Arweave:** violates NFR-5 privacy; images are claim evidence, not public content.
- **An NFT per photo:** adds nothing to the proof and contradicts §6 Non-Goals.
- **Offchain-only signature verification:** simpler, but removes the independent-verifiability claim and weakens "Why Monad." It is only a fallback (A4 go/no-go).
- **Storing all fingerprints in contract state:** costs more gas for no gain over events plus the indexer, and hurts SM-C3.
- **Other product candidates** (group spending, agent payment rail, Kuru trading app, ticketing): rejected on 2026-09-28 because the public Metropolis field is crowded in those spaces. See `~/monad-metropolis-brainstorm.md`.
