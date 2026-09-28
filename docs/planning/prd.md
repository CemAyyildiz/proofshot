---
title: Proofshot
status: draft
created: 2026-09-28
updated: 2026-09-28
---

# PRD: Proofshot
*Working title. Confirm before the public submission profile is created.*

| | |
|---|---|
| Owner / builder | Cem Ayyıldız (solo) |
| Context | Monad Metropolis hackathon, Track 04 (Trust, Identity & AI Infrastructure). Target: Grand Champion |
| Build window | 2026-09-28 → 2026-10-12 (submission target). Hard deadline 2026-10-13 |
| Network | Monad mainnet (chain ID 143); testnet for development |
| Companion docs | `addendum.md` (architecture direction, tech choices, delivery plan, demo script, competitive detail) · `~/monad-metropolis-brainstorm.md` (ideation and selection rationale) |

## 0. Document Purpose

This PRD is the source of truth for **what** Proofshot must do and **how we know it is done**. It feeds the BMAD chain `bmad-ux` → `bmad-architecture` → `bmad-create-epics-and-stories` → dev stories. Vocabulary is fixed by the §3 Glossary and must be used verbatim downstream. Features (§4) nest globally numbered FRs (FR-1…FR-N) with testable consequences. Each FR carries a priority: **P0** means the submission is not viable without it, **P1** is needed for a Grand Champion-grade submission, and **P2** is a stretch or bounty add-on. Inferences not yet confirmed by the owner are tagged `[ASSUMPTION]` and indexed in §16. Implementation choices (libraries, frameworks, contract layout) live in `addendum.md`, not here.

## 1. Vision

Insurance claims now run on photos, and photos can no longer be trusted. Generative editing tools let anyone add a dent, a crack or water damage in seconds. Genuine photos are also recycled: the same image gets filed against several insurers, sometimes years apart. Industry provenance metadata (C2PA) is stripped the moment an image passes through a messaging app or social platform, so the evidence loses its proof exactly when it moves between parties.

Proofshot makes a claim photo **prove itself**. The policyholder opens a claim link, authenticates with Face ID or a fingerprint, and takes the photo inside Proofshot. Before the shutter animation finishes, the photo is sealed to a public ledger. The record carries a signature from the policyholder's device-bound key, a tight signing window, and fingerprints that survive recompression. From then on, anyone holding any copy of that photo can check three things without an account and without trusting Proofshot the company: when the photo was sealed, whether it was altered and where, and whether it was already used in another claim.

The market is already validated. Verisk runs cross-carrier duplicate image checks over ClaimSearch, and Attestiv anchors claim-media fingerprints on a public blockchain. Both are **vendor-held**: carriers hand their images to the vendor, only subscribers can check, and the policyholder walks away with nothing they can prove. Proofshot is the **open version**. The proof is created on the policyholder's device at capture, the policyholder owns the Receipt, anyone can re-check it from public data, and cross-carrier duplicate detection runs on shared fingerprints while the photos never leave the Carrier. The bet is that **independently verifiable proof** becomes the standard for evidence that moves between parties who do not trust each other, the way signed documents did. A closed detection score cannot become that standard.

## 2. Target User

### 2.1 Jobs To Be Done
- **Policyholder (functional):** "Get my claim accepted quickly, without being treated as a suspect or asked to re-shoot evidence."
- **Policyholder (emotional):** "Have proof that what I showed is real, even if the insurer disputes it."
- **Claims adjuster (functional):** "Know in seconds whether a photo can be relied on, so I can fast-track honest claims and escalate the rest."
- **SIU investigator (functional):** "Catch photos that were recycled from earlier claims, even at other carriers, without a manual reverse-image search per file."
- **Third party, such as an attorney, a reinsurer or a journalist (functional):** "Independently verify a photo I received second-hand, without asking the insurer or the vendor."

### 2.2 Non-Users (v1)
- Photo-forensics analysts who need pixel-level forensic reports on *unsealed* images. Proofshot proves provenance of sealed captures; it is not an AI-image detector for arbitrary images.
- Social media users who want to "verify" viral images they did not capture.
- Carriers that need core claims-system integration (Guidewire, Duck Creek) in v1.

### 2.3 Key User Journeys

- **UJ-1. Elif seals hail damage on her car before the adjuster calls back.**
  - **Persona + context:** Elif, 34, Ankara, filed a claim by phone after a hailstorm. She has never used crypto and is wary of "another app."
  - **Entry state:** Unauthenticated. She receives an SMS or email with a Claim Link from her Carrier.
  - **Path:** (1) Taps the Claim Link, and it opens in the mobile browser with no install. (2) Sees the Carrier's name, the claim reference and "Take photos of the damage." (3) Registers a passkey with one Face ID prompt. (4) Takes 4 photos inside the capture screen; each shows "Sealed ✓ · 0.8 s" as the shutter animation ends. (5) Taps "Send to insurer."
  - **Climax:** Each photo shows a green Seal badge with a timestamp. She can open a Verification Receipt link for any photo.
  - **Resolution:** The Claim File moves to "Evidence received." Elif keeps the receipt links.
  - **Edge case:** She tries to attach an older photo from her gallery. Proofshot explains that only photos taken in Proofshot can be sealed, and opens the camera.

- **UJ-2. Marcus fast-tracks an honest claim and flags an altered one.**
  - **Persona + context:** Marcus, claims adjuster at Carrier A, handles about 40 auto claims a week and has no forensics training.
  - **Entry state:** Signed in to the Carrier Console.
  - **Path:** (1) Opens Elif's Claim File. (2) Sees each Capture with its Verdict. (3) In another file, a policyholder emailed a "better" version of a sealed photo; Marcus drops it into the file. (4) The Verdict returns **Altered**, and the Tile Map highlights the modified region in red.
  - **Climax:** He approves Elif's file and routes the altered one to SIU with the Verification Receipt attached. There is no manual forensics step.
  - **Resolution:** Both decisions carry a receipt that anyone can re-check.

- **UJ-3. Dana catches a photo already used at another carrier.**
  - **Persona + context:** Dana, SIU investigator at Carrier B. She suspects a ring that re-files the same damage.
  - **Entry state:** Signed in to the Carrier Console at Carrier B.
  - **Path:** (1) A new Claim File arrives with a sealed photo. (2) The Console shows a **Duplicate Alert**: this image matches a Capture sealed 11 days earlier under a different Carrier. (3) She opens the alert and sees the match strength, the seal date, and "another carrier" (pseudonymous). She never sees Carrier A's photo or customer.
  - **Climax:** She has cross-carrier evidence of reuse without any data-sharing agreement.
  - **Resolution:** The file is escalated. Dana can request details from Carrier A through normal industry channels, citing the registry record.

- **UJ-4. Tomás verifies a photo forwarded over WhatsApp.** *(lighter)*
  Tomás, the policyholder's attorney, receives a compressed WhatsApp copy of a claim photo. He opens the Public Verifier and drops it in. The Verdict is **Derived Copy of an Original**: sealed 2 Oct 14:03:21, no altered regions. He needs no account and no contact with the Carrier.

## 3. Glossary

- **Capture** — A photo taken inside Proofshot's capture screen, together with its fingerprints. A Capture belongs to exactly one Capturer and at most one Claim File.
- **Capturer** — The person taking a Capture (in v1, the policyholder). Identified only by their Device Key; Proofshot stores no name.
- **Device Key** — A passkey key pair bound to the Capturer's device secure hardware. One Capturer may hold several Device Keys (several devices).
- **Seal** / **to seal** — The act of writing a Capture Record to the Registry after verifying the Device Key signature. A Capture is *sealed* once its Capture Record reaches finality.
- **Capture Record** — The onchain entry for a sealed Capture: Exact Hash, Perceptual Hash, Tile Hashes, image dimensions, Device Key identifier, Signing Window, Location Commitment, and the pseudonymous Carrier ID. **It never contains image bytes.**
- **Registry** — The public onchain collection of all Capture Records and Imported Records, shared by every Carrier.
- **Imported Record** — A Registry entry a Carrier creates from the fingerprints of a photo it received outside Proofshot (for example, historical claims). It carries no Device Key signature and is always labelled "imported."
- **Exact Hash** — A cryptographic hash of the original image bytes. It matches only identical files.
- **Perceptual Hash** — A fingerprint of the whole image's visual content. It stays close under recompression, resizing and minor crops.
- **Tile Hashes** — Perceptual Hashes of a fixed grid of regions of the image, used to localize alterations.
- **Tile Map** — The visual overlay that shows which grid regions differ between a submitted image and its matched Capture Record.
- **Signing Window** — The interval between the most recent ledger block referenced in the signed payload (lower bound) and the block in which the Capture Record was written (upper bound).
- **Location Commitment** — A salted hash of the capture location. It reveals nothing unless the Capturer or Carrier discloses the salt.
- **Verification** — Checking a submitted image against the Registry. It produces exactly one Verdict.
- **Alteration Check** — The tile-level comparison behind **Altered** vs **Derived Copy**. Its result is *passed*, *failed* or *unavailable*. It is unavailable when the submitted image's aspect ratio differs from the Capture Record's by more than 2% (for example, after a crop), because the tiles no longer align.
- **Verdict** — One of: **Original** (Exact Hash match), **Derived Copy** (Perceptual Hash match and no Tile Hashes differ beyond threshold), **Altered** (Perceptual Hash match, but one or more Tile Hashes differ beyond threshold), **No Record** (no match). A match against an Imported Record is always shown with the "imported" label.
- **Verification Receipt** — A public, shareable page for one Verification or one Capture Record, showing the Verdict and the onchain references that let anyone re-check it.
- **Carrier** — An insurer organization using the Carrier Console. It is identified onchain only by a pseudonymous Carrier ID.
- **Carrier User** — A person (adjuster or investigator) signed in to one Carrier's workspace. Belongs to exactly one Carrier.
- **Carrier Console** — The web workspace where a Carrier's adjusters and investigators manage Claim Files.
- **Claim File** — A Carrier-side container for one claim: a reference string, its Claim Link, its Captures and any Verifications run inside it.
- **Claim Link** — A unique URL that lets a Capturer add Captures to exactly one Claim File. It is revocable and expiring.
- **Duplicate Alert** — A Console notice raised when a Capture or uploaded image in one Claim File matches a Registry entry belonging to a different Claim File (same or different Carrier).
- **Public Verifier** — The unauthenticated web page where anyone can run a Verification.

## 4. Features

### 4.1 Claim Link & Capturer Onboarding
**Description:** A Carrier user creates a Claim File and gets a Claim Link to send through their usual channel. The Capturer opens it in a mobile browser with no install and no wallet, registers a Device Key with one biometric prompt, and lands on the capture screen. Words such as wallet, gas, token or chain never appear in Capturer-facing UI. Realizes UJ-1.

#### FR-1: Create Claim File and Claim Link — P0
A Carrier user can create a Claim File with a reference string and receive a Claim Link for it. Realizes UJ-1, UJ-2.
**Consequences (testable):**
- Creating a Claim File returns a unique Claim Link within 2 s.
- A Claim Link is valid for 14 days by default `[ASSUMPTION: 14-day expiry is acceptable]` and can be revoked. A revoked or expired link shows a clear "This link is no longer active" page and accepts no Captures.
- A Claim Link resolves to exactly one Claim File. Captures made through it appear only in that Claim File.

#### FR-2: Passkey onboarding without crypto concepts — P0
A Capturer can register a Device Key from a Claim Link with a single platform biometric or PIN prompt. Realizes UJ-1.
**Consequences (testable):**
- A first-time Capturer on a supported device (§11) goes from opening the Claim Link to a ready capture screen in ≤ 2 prompts and a median of ≤ 30 s (measured in usability tests, SM-4).
- The Capturer never has to fund, approve or sign a ledger transaction, or view a seed phrase or address.
- A returning Capturer on the same device authenticates with the existing Device Key instead of creating a new one.
- On an unsupported browser, the Capturer sees a specific message naming the supported browsers. The UI never shows a raw error.

### 4.2 Controlled Capture & Sealing
**Description:** The capture screen uses the live camera only. Before sealing, the Capture's fingerprints, a Location Commitment and a reference to the latest ledger block are bundled and signed by the Device Key. That signature is the same biometric act the Capturer already performs. The Registry verifies the signature onchain and writes the Capture Record. Proofshot sponsors all ledger fees. Realizes UJ-1.

#### FR-3: Live-camera-only capture — P0
A Capturer can create Captures only from the live camera feed inside Proofshot. Realizes UJ-1.
**Consequences (testable):**
- The capture screen offers no gallery, file picker or paste input.
- Attempting to reach capture without camera permission shows guidance to grant it. No alternative input is offered.

**Out of Scope:** Detecting virtual cameras or re-photographed screens (see §9 Threat Model, T-1 and T-2).

#### FR-4: Device-signed Seal with onchain signature verification — P0
The system seals each Capture by verifying the Device Key's signature over the Capture's fingerprints *onchain* and writing the Capture Record to the Registry. Realizes UJ-1.
**Consequences (testable):**
- The signed payload binds, at minimum: Exact Hash, Perceptual Hash, Tile Hashes, Location Commitment, capture timestamp claimed by the device, Claim File reference, and the latest-block reference.
- The Registry rejects a Capture Record whose signature does not verify against the registered Device Key. Rejection is covered by an automated test with a tampered payload.
- The Registry rejects a second Capture Record with an identical Exact Hash. The Seal fails with "already sealed," and the UI shows the existing Verification Receipt.
- The Signing Window is recorded and displayed. Its lower bound is the referenced block and its upper bound is the inclusion block.

#### FR-5: Sub-second perceived Seal feedback — P1
A Capturer sees each Capture's Seal status on the capture screen as it happens. Realizes UJ-1.
**Consequences (testable):**
- The shutter-to-"Sealed ✓" time meets NFR-1.
- While a Seal is pending, the Capture shows "Sealing…" and can still be reviewed. A failed Seal shows "Not sealed — retry" and keeps the Capture on the device until it is retried or discarded.
- Up to 10 Captures can be taken in a row without waiting for earlier Seals to complete.

#### FR-6: Send Captures to the Carrier — P0
A Capturer can send sealed Captures to the Claim File, and the Carrier receives the image files. Realizes UJ-1, UJ-2.
**Consequences (testable):**
- Only sealed Captures can be sent.
- The image file received by the Carrier produces an **Original** Verdict when verified.
- Image files are stored only in Carrier-scoped storage. They are never written to the Registry (see NFR-5).

#### FR-7: Gasless operation — P0
The system pays all ledger fees for Seals and Imported Records. Realizes UJ-1.
**Consequences (testable):**
- No Capturer or Carrier user holds or spends a ledger asset in any flow.
- Fee sponsorship is rate-limited per Claim Link (default ≤ 50 Seals) and per Device Key (default ≤ 200 per day), so an abusive client cannot drain the sponsor balance. Exceeding a limit returns a clear message.

### 4.3 Public Verification
**Description:** Anyone can drop an image onto the Public Verifier and get one Verdict with a shareable Verification Receipt. No account is needed. Verification is computed from Registry data, so a third party can reproduce it without trusting Proofshot's servers. Realizes UJ-2, UJ-4.

#### FR-8: Verify an image — P0
Any person can submit an image to the Public Verifier and receive exactly one Verdict. Realizes UJ-4.
**Consequences (testable):**
- Supported inputs: JPEG, PNG, WebP and HEIC, up to 20 MB.
- An identical file of a sealed Capture returns **Original**.
- A copy recompressed by WhatsApp or X, or resized to ≥ 50% of the original width, returns **Derived Copy** at the rate set in SM-2.
- A copy cropped by ≤ 10% returns **Derived Copy** with the Alteration Check marked *unavailable*. The UI shows this warning at the same visual weight as the Verdict: "Cropped copy — alteration check not possible. Request the original from the sender." A cropped copy never shows a clean result.
- An image with no Registry match returns **No Record**. The UI states that No Record means "not sealed with Proofshot," not "fake."
- The submitted image is processed for fingerprints and is not retained after the Verification unless it is submitted inside a Claim File (FR-14).

#### FR-9: Verification Receipt — P0
Every Verification and every Capture Record has a Verification Receipt page at a stable public URL. Realizes UJ-2, UJ-4.
**Consequences (testable):**
- The receipt shows the Verdict, the seal time, the Signing Window, the Device Key identifier (shortened), the Carrier as "a carrier" (pseudonymous), and a link to the Capture Record on a public block explorer.
- The receipt includes step-by-step instructions to reproduce the check independently from Registry data, as a documented procedure plus an open-source script.
- The receipt never shows the image unless the viewer submitted it themselves in the current session.

#### FR-10: Independent reproducibility — P1
A technically capable third party can reproduce any Verdict using only the public Registry and the open-source fingerprinting tool. Realizes UJ-4.
**Consequences (testable):**
- A published command-line script, given an image and a network endpoint, outputs the same Verdict as the Public Verifier for all benchmark-set images (SM-2).

### 4.4 Tamper Localization
**Description:** When an image matches a Capture Record but some regions have changed, the Verdict is **Altered**, and the Tile Map shows where. This is the demo's "visceral moment" and the adjuster's fast-escalation signal. Realizes UJ-2.

#### FR-11: Altered Verdict with Tile Map — P1
The system returns **Altered** and a Tile Map when a submitted image matches a Capture Record overall but one or more Tile Hashes differ beyond threshold. Realizes UJ-2.
**Consequences (testable):**
- On the benchmark set, localized generative edits covering ≥ 5% of the image area are detected as **Altered** at the rate set in SM-2, and the edited region falls inside a highlighted tile at least 90% of the time.
- Recompression alone does not produce **Altered** beyond the false-positive ceiling in SM-C1.
- The Tile Map is legible on a 375 px-wide screen.
- The Alteration Check is only run when it is available (see Glossary). A cropped-and-edited image must never receive a clean **Derived Copy**. The best it can get is **Derived Copy** with the Alteration Check *unavailable* (see FR-8).

**Notes:** `[NOTE FOR PM]` If Spike A (addendum §A5) shows tile-level detection cannot hit SM-2, downgrade FR-11 to P2 and narrow the product claim to Original, Derived Copy and duplicate detection. This decision is due 2026-09-29.

### 4.5 Cross-Carrier Duplicate Detection
**Description:** The Registry is shared. Whenever a Capture or an uploaded image enters a Claim File, it is checked against every other Registry entry. A match in a different Claim File, including at another Carrier, raises a Duplicate Alert. The alert reveals only what the Registry holds: match strength, seal date and whether the matched Carrier is the same or different. It never reveals the other Carrier's identity, customer or image. Realizes UJ-3.

#### FR-12: Duplicate Alert — P0
The system raises a Duplicate Alert in the Carrier Console when an image in a Claim File matches a Registry entry linked to a different Claim File. Realizes UJ-3.
**Consequences (testable):**
- Alerts cover matches in the same Carrier and in different Carriers, and label them "same carrier" or "another carrier."
- An alert is visible in the Claim File within 10 s of the triggering Capture being sealed or the image being uploaded.
- An alert for a different Carrier shows no customer data, no Claim File reference and no image from that Carrier.

#### FR-13: Import historical fingerprints — P1
A Carrier user can bulk-import fingerprints of photos received outside Proofshot, creating Imported Records. This makes duplicate detection useful before any policyholder has used Proofshot. Realizes UJ-3.
**Consequences (testable):**
- Uploading a folder or zip of up to 500 images creates one Imported Record per image. Images are fingerprinted and discarded, not stored.
- Matches against Imported Records are always labelled "imported (unsigned)" and can never produce an **Original** Verdict based on a signature.

### 4.6 Carrier Console
**Description:** The adjuster's and investigator's workspace: Claim Files, their Captures with Verdicts, Duplicate Alerts, and in-file Verification of images that arrived by email or other channels. Designed for non-technical adjusters. Realizes UJ-2, UJ-3.

#### FR-14: Claim File view — P0
A Carrier user can open a Claim File and see every Capture, uploaded image, Verdict and Duplicate Alert in one list. Realizes UJ-2.
**Consequences (testable):**
- Each item shows a thumbnail, the Verdict badge, the seal time and a link to its Verification Receipt.
- A Carrier user can upload an image into the Claim File to verify it. The image is retained in Carrier-scoped storage, and duplicate checks run on it (FR-12).
- Claim Files are visible only to users of the Carrier that owns them.

#### FR-15: Carrier sign-in and tenancy — P0
Carrier users sign in to a Carrier-scoped workspace. Realizes UJ-2, UJ-3.
**Consequences (testable):**
- A user of Carrier A cannot read any Claim File, image or Capture of Carrier B through the UI or the API. This is covered by an automated authorization test.
- The hackathon build ships with at least two seeded demo Carriers.

**Out of Scope:** SSO, roles and permissions beyond "member," and audit export.

### 4.7 Evidence Corroboration — P2 *(stretch; bounty-aligned)*
**Description:** For weather-related claims, the Console can attach an independent, onchain attestation of recorded weather at the Claim File's disclosed location and date. Realizes UJ-2.

#### FR-16: Weather attestation — P2
A Carrier user can request a weather attestation for a Claim File. The system then writes an onchain attestation of observed conditions (for example, hail reported: yes or no) produced by a decentralized oracle workflow.
**Consequences (testable):**
- The attestation appears in the Claim File with its source(s) and a block-explorer link within 2 minutes.
- The feature only runs if the Capturer or Carrier has disclosed the location (Location Commitment salt).

### 4.8 Adjuster Damage Summary — P2 *(stretch; bounty-aligned)*
#### FR-17: AI damage summary — P2
A Carrier user can generate a short text summary of visible damage across a Claim File's Captures.
**Consequences (testable):**
- The summary is labelled "AI-generated — not a determination" and is never shown to the Capturer.
- The summary does not affect any Verdict.

### 4.9 Judge & Evaluator Sandbox
**Description:** Judges evaluate from a demo, a write-up and code, and most will never see a live pitch. Letting any evaluator run the full loop on their own phone in under two minutes turns "claimed" into "experienced." Realizes UJ-1, UJ-4.

#### FR-18: Public try-it flow — P1
Any visitor can start a sandbox Claim File in a public demo Carrier, seal Captures from their own phone, and verify them. No sign-up is required.
**Consequences (testable):**
- From the landing page, a visitor reaches a ready capture screen in ≤ 3 taps plus the passkey prompt. Desktop visitors get a QR code to continue on a phone.
- Sandbox Captures are sealed on mainnet like any other. Their Capture Records carry the demo Carrier ID, so they are distinguishable and excluded from SM-3.
- After sealing, the visitor sees a guided "now try to fool it" step: download the photo, edit or recompress it, and drop it into the Public Verifier.
- The sandbox shares the FR-7 rate limits. A visitor who exceeds them sees a friendly limit message.

## 5. Why Now
- **The generative editing shock:** 98% of insurers say AI editing tools are fuelling digital fraud, and 99% have already received manipulated documentation (Verisk, March 2026). One UK insurer reported a 71% fraud rise in 2025.
- **Provenance metadata fails in transit:** C2PA manifests are effectively always stripped by major social and messaging platforms, so existing standards cannot follow evidence between parties.
- **The enabling tech just landed:** Monad mainnet ships a P256 signature precompile (passkeys can be verified onchain cheaply), 300 ms blocks and about 600 ms finality (July 2026), and fees low enough to seal every photo individually. Two years ago, per-photo onchain device-signature verification was impractical.

## 6. Non-Goals (Explicit)
- **Not an AI-image detector.** Proofshot does not judge whether an arbitrary, unsealed image is synthetic.
- **Not a claims-management system.** No payouts, reserves, workflow routing or policy data.
- **Not a crypto product for users.** No token, NFT, wallet UI or asset custody, now or in the roadmap.
- **Not an image host.** The Registry never stores images. Proofshot does not publish Carrier images.
- **Not a determination of fraud.** Verdicts are evidence signals for humans; the product never auto-denies a claim.
- **Not video** in v1.

## 7. MVP Scope (hackathon submission, 2026-10-12)

### 7.1 In Scope
- All P0 FRs: FR-1–FR-4, FR-6–FR-9, FR-12, FR-14, FR-15.
- P1 FRs in this order: FR-11 (Tile Map, depends on Spike A), FR-18 (judge sandbox), FR-5, FR-13, FR-10.
- Running on **Monad mainnet**, with a verified Registry contract.
- A published benchmark report (§8 SM-2) and a public repository.
- Two seeded demo Carriers plus real Captures from ≥ 20 real devices (SM-3).

### 7.2 Out of Scope for MVP
- FR-16 and FR-17 (P2), unless all P0/P1 work is complete by 2026-10-08.
- Native mobile apps (a PWA suffices; native apps are needed later for hardware attestation, see T-1).
- Device or hardware attestation (App Attest, Play Integrity). This is v2 and is the #1 roadmap item.
- Real carrier integrations, SSO or claims-system connectors.
- Location disclosure UX beyond the commitment (disclosure is manual in v1).
- `[NOTE FOR PM]` Hardware attestation is the most likely judge objection. It is kept out for time, but the submission must present it as the next milestone with a concrete plan (§9).

## 8. Success Metrics

Two horizons: **H** = the hackathon submission (measured by 2026-10-12), **P** = product validation after the hackathon.

**Primary**
- **SM-1 (H) End-to-end on mainnet:** the full UJ-1 → UJ-2 → UJ-3 → UJ-4 sequence runs live on Monad mainnet in one unedited demo take. Validates FR-1–FR-4, FR-6, FR-8, FR-9, FR-12, FR-14.
- **SM-2 (H) Verification accuracy on a published benchmark:** on a benchmark of ≥ 50 sealed Captures × transforms (WhatsApp, X, screenshot, 50% resize, 10% crop, generative inpaint):
  - Derived Copy recall ≥ 95% for recompression and resize transforms.
  - Altered recall ≥ 80% for generative edits ≥ 5% of area (if FR-11 ships).
  - The benchmark method and raw results are published in the repository.
  Validates FR-8, FR-11.
- **SM-3 (H) Real-world use:** ≥ 20 distinct Device Keys and ≥ 60 sealed Captures from real people (not the builder) on mainnet by 2026-10-11. Validates FR-2, FR-4.

**Secondary**
- **SM-4 (H) Onboarding:** in ≥ 5 unmoderated tests with non-crypto users, ≥ 80% seal a first Capture without help, with median time from opening the Claim Link to first Seal ≤ 60 s. Validates FR-2, FR-5.
- **SM-5 (H) Seal latency:** p95 shutter-to-"Sealed ✓" ≤ 3 s over ≥ 100 mainnet Seals. Published with the measurement method. Validates FR-5, NFR-1.
- **SM-6 (H/P) Demand evidence:** ≥ 5 conversations with claims or SIU practitioners, quotes cleared for use, and ≥ 1 written pilot interest. Validates the thesis in §1.
- **SM-7 (P) Carrier value:** in a pilot, the share of Claim Files where a Verdict changed the handling decision (fast-track or escalation). Target to be set after the first pilot.

**Counter-metrics (do not optimize)**
- **SM-C1 False Altered rate:** recompression-only images wrongly returned as **Altered** must stay ≤ 5%. Tuning thresholds to raise Altered recall (SM-2) at the cost of wrongly flagging honest policyholders is prohibited. Counterbalances SM-2.
- **SM-C2 False Original / Derived Copy on different scenes:** visually similar but different scenes (for example, two cars of the same model) must not match. Target ≤ 1% on a near-duplicate negative set. Counterbalances SM-2 and FR-12.
- **SM-C3 Onchain data footprint per Capture:** do not grow the Capture Record to store more for convenience. Anything added must pass the privacy review in §10. Counterbalances SM-1 and SM-3.
- **SM-C4 Capture volume via sock puppets:** SM-3 counts only distinct people. Scripted or builder-generated Captures are excluded and reported separately.

## 9. Threat Model & Trust Boundaries

*What a Seal proves, what it does not, and what we say about it. This section is load-bearing for the submission write-up.*

**A Seal proves:** (a) a specific Device Key signed these fingerprints; (b) within the Signing Window; (c) the image has not changed since, or where it changed (Altered + Tile Map); (d) whether the same visual content already exists elsewhere in the Registry.

**A Seal does not prove:** that the pixels came from the device's camera sensor, that the scene is what the Capturer says it is, or who the Capturer is legally.

| # | Threat | v1 stance | Planned mitigation |
|---|---|---|---|
| T-1 | Virtual camera or injected frames feed a fabricated image into the live-capture screen | **Accepted, disclosed.** Duplicate detection and alteration detection still apply. | v2: native capture with iOS App Attest / Android Play Integrity attestation bound into the signed payload |
| T-2 | Re-photographing a screen or print of a recycled image | Partially mitigated: the Perceptual Hash often matches the original if it is in the Registry, raising a Duplicate Alert | v2: recapture (moiré or screen) detection |
| T-3 | Replay of a signed payload | Rejected by FR-4 (duplicate Exact Hash) and Signing Window bounds | — |
| T-4 | Sponsor-fee drain by scripted Seals | FR-7 rate limits | Per-Carrier fee budgets |
| T-5 | Registry probing to learn about other Carriers' claims | Duplicate Alerts reveal only match strength, date and a same/other-carrier flag; Carrier IDs are pseudonymous | Rotating pseudonymous Carrier IDs |
| T-6 | Adversarial perturbation to evade Perceptual Hash matching of a recycled image | Accepted in v1 | Multiple fingerprint algorithms; region-level matching |
| T-7 | Lost or compromised Device Key | Captures stay valid for their Signing Window; keys can be marked revoked from that point on | Key revocation UI |

## 10. Constraints & Guardrails

### 10.1 Privacy
- **NFR-5:** The Registry stores only hashes, commitments, identifiers and block references. No image bytes, names, contact details, plate numbers or precise locations. This is enforced by the contract interface and verified in code review.
- Location enters the Registry only as a Location Commitment. Disclosure is always an explicit act by the Capturer or Carrier.
- Public Verifier uploads are not retained (FR-8).
- `[ASSUMPTION: Perceptual Hashes are acceptable to publish.]` Perceptual hashes of ordinary damage photos are not considered personal data for the hackathon. This needs legal review before any real pilot, especially for images containing faces or plates. See OQ-3.

### 10.2 Cost
- Sponsored fees for the hackathon (≤ 5,000 Seals) must stay within a budget the builder confirms after Spike B `[ASSUMPTION: fees ≤ US$50 total]`.

### 10.3 Hackathon rules
- All submitted work is built between 2026-09-28 and 2026-10-12. The repository history must show this.
- The submission includes a working product, a demo, a short write-up and a code link (Metropolis rules).

## 11. Cross-Cutting NFRs
- **NFR-1 Seal latency:** p95 ≤ 3 s from shutter to "Sealed ✓" on a 4G connection. The ledger's contribution (inclusion to finality) is measured and reported separately.
- **NFR-2 Verification latency:** p95 ≤ 3 s for a Public Verifier Verdict with ≤ 10,000 Registry entries, excluding upload time.
- **NFR-3 Supported devices:** iOS 17+ Safari, Android 13+ Chrome and desktop Chrome/Safari (for the Console and Public Verifier). Capture is supported on mobile only.
- **NFR-4 Availability (hackathon):** the demo URL is reachable for 99% of checks during judging (2026-10-14 → 2026-10-27), monitored by an external uptime check.
- **NFR-5 Privacy:** see §10.1.
- **NFR-6 Correctness of the Registry:** every Registry write path has automated tests, including the negative cases in FR-4. The contract is source-verified on the public explorer.
- **NFR-7 Accessibility:** the capture screen and Verdict badges meet WCAG 2.1 AA contrast. Verdicts are conveyed by text and icon, never color alone.
- **NFR-8 Language:** All product surfaces (Capture PWA, Carrier Console, Public Verifier, Verification Receipts), all product-generated text, documentation, repository content, the demo and the submission write-up are English-only. No localization in v1.

## 12. Experience Principles (brief for `bmad-ux`)
- **Invisible ledger:** the Capturer's vocabulary is "photo," "sealed," "sent" and "receipt." Never "transaction," "wallet" or "gas."
- **Evidence-grade calm:** a restrained, institutional visual tone (think bank statement, not crypto dashboard). Verdict colors are reserved exclusively for Verdicts.
- **Honest Verdicts:** every Verdict states what it means and what it does not mean (for example, No Record ≠ fake).
- **One-hand capture:** every capture-screen control is reachable with the thumb, and sealing feedback never blocks the next shot.
- **Anti-references:** crypto-wallet onboarding, forensic tools with dense metadata dumps.

## 13. Business Model & Go-to-Market

**Thesis:** Incumbents (Verisk Digital Media Forensics + ClaimSearch, Attestiv, Truepic) prove carriers pay for photo-fraud tooling. Proofshot competes on something they structurally cannot offer without abandoning their data-pooling model: **proof owned by the policyholder and verifiable by anyone, with no photo leaving the Carrier**. The Registry still gets more valuable with every Carrier that joins, and the cold-start problem is solved with Imported Records (FR-13): a Carrier gets value on day one from its own history.

- **Buyer:** the claims or SIU leader at a P&C carrier; also independent adjusting firms and MGAs, which have shorter sales cycles (OQ-4).
- **Where incumbents are weakest:** (a) markets without a ClaimSearch-style contributory utility (much of EMEA, LatAm and Asia); (b) disputed claims, appeals and litigation, where a vendor-held score is not accepted as neutral; (c) non-insurance photo-evidence markets (rentals, marketplaces, logistics) that Verisk does not serve.
- **Pricing (hypothesis):** a per-Claim-File fee for Claim Files with sealed evidence, plus a per-Verification API fee for high-volume screening. Capturers and Public Verifier users are always free, because free public verification is what makes Receipts credible. `[ASSUMPTION: the per-Claim-File price point is set after SM-6 conversations; no number is committed in v1.]`
- **Wedge sequence:** (1) auto glass and hail claims (high volume, photo-only, known recycling patterns) → (2) property water damage → (3) other photo-evidence markets on the same Registry: rental deposits, marketplace disputes, logistics damage.
- **Cost structure:** ledger fees are sponsored and scale with Seals. They must stay a negligible share of the per-Claim-File price, which is verified with Spike B numbers (OQ-2).
- **Defensibility:** the Registry itself is public, so the moat is not the data. It is (1) the capture flow, which sits at the policyholder's device, upstream of every incumbent that only sees images after submission; (2) the network of Carriers writing to the Registry; and (3) the published Alteration Check benchmark. `[NOTE FOR PM]` "Why can't Verisk or Attestiv add a public verifier?" is the hardest judge question. The answer is that their business model is the pooled database and the subscription. Rehearse it for the write-up.

## 14. Delivery Risks (solo, 15 days)

| # | Risk | Likelihood | Impact | Mitigation | Trigger / owner action |
|---|---|---|---|---|---|
| R-1 | Tile-level detection misses SM-2 | Medium | High (loses the "Altered" demo moment) | Go/no-go on 2026-09-29; narrow the claim honestly | Spike A results |
| R-2 | Onchain WebAuthn verification fails or is too slow on mainnet | Low | High ("Why Monad" weakens) | Spike B on day 2; documented fallback in the addendum | Spike B results |
| R-3 | Scope creep from stretch bounties | High | High | P2 locked until 2026-10-08; no new features after 2026-10-09 | Daily check against §7 |
| R-4 | Too few real users for SM-3 | Medium | Medium | Recruiting starts 2026-10-03, not 10-07; sandbox (FR-18) doubles as the recruiting link | < 10 Device Keys by 10-08 |
| R-5 | Demo breaks during judging (RPC, relayer balance, storage) | Medium | Critical | Uptime monitor (NFR-4), relayer balance alert, secondary RPC, recorded video as a backup | Any alert 10-14 → 10-27 |
| R-6 | Builder illness or time loss | Low | Critical | 2026-10-13 kept as a buffer day; a demo-able build frozen by 10-09 | — |
| R-7 | A near-identical project surfaces in the final days | Low | Medium | Differentiate on the cross-carrier Registry, the published benchmark and measured numbers, not on the concept | Re-scan public repos on 10-08 |

## 15. Open Questions
1. **OQ-1:** Does tile-level detection meet SM-2 on real generative edits? Resolved by Spike A on 2026-09-29 and determines FR-11's priority.
2. **OQ-2:** What is the measured gas per Seal, including onchain signature verification? Is batching several Captures into one transaction needed to hit NFR-1 and §10.2? Resolved by Spike B.
3. **OQ-3:** Under GDPR and KVKK, are published Perceptual Hashes of images that may contain faces or plates personal data? Post-hackathon legal review; blocks real pilots, not the submission.
4. **OQ-4:** Who is the first paying buyer: carriers directly, independent adjusting firms or insurtech MGAs? Informs the write-up's go-to-market section; to be answered by SM-6 conversations.
5. **OQ-5:** Should Duplicate Alerts across Carriers be opt-in per Carrier (a consortium model) or default on? Default on for the demo; the product decision is deferred.
6. **OQ-6:** Final product name and domain before the public profile is created.
7. **OQ-7:** Does Verisk's Digital Media Forensics or Attestiv already expose any policyholder-facing or public verification? Check product docs and ask in SM-6 conversations before the write-up claims they do not.

## 16. Assumptions Index
- §4.1 FR-1: a 14-day default Claim Link expiry is acceptable.
- §10.1: Perceptual Hashes of damage photos are acceptable to publish for the hackathon (pending OQ-3).
- §13: the per-Claim-File price point is set after SM-6 conversations.
- §10.2: total sponsored fees for the hackathon stay ≤ US$50.
- Builder profile (from memlog): comfortable with TypeScript/React and basic Solidity; 6–8 h/day available through 2026-10-12.
- Spike A premise (from memlog): whole-image plus 4×4 tile perceptual fingerprints can separate recompressed copies from generative edits.
