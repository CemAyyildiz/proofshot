# Judge's guide

Five minutes, a phone, no sign-up.

## 1. Seal a photo and try to fool the verifier (3 minutes)

1. Open the demo site on your phone (or scan the QR code on the landing page from a laptop) and tap **Try it on this
   phone**.
2. Tap **Continue** and confirm with Face ID / fingerprint. That single prompt creates a passkey; no wallet, no app.
3. Tap the shutter. Within the burst, each photo turns **Sealed** with the time it took.
4. Under **Now try to fool it**: save the photo, then change it — paint over a detail, or send it to yourself on
   WhatsApp and save that copy.
5. Drop the copy into **Verify a photo**:
   - the untouched file → **Original**;
   - the WhatsApp copy → **Derived Copy**, "no regions were changed";
   - the painted copy → **Altered**, with the changed regions outlined on a 4×4 map;
   - a thin edge trim (≈2–3%) → **Derived Copy · check unavailable**, stated as prominently as the Verdict; a bigger
     crop → **No Record** (the known limit below);
   - any other photo → **No Record** — "not sealed with Proofshot", never "fake".
6. Open the **Verification Receipt**: the Signing Window, the full device key and hashes (a receipt is audit evidence,
   so nothing is shortened), "a carrier", and "Verify it yourself".

## 2. What makes it trustworthy (2 minutes of reading)

| Claim | Where the evidence is |
|---|---|
| Passkey signatures verify natively on Monad testnet **and mainnet** | `docs/spikes/spike-b-probe.json` (keyless probe of the Registry's exact verification; re-run with `pnpm --filter @proofshot/contracts probe`) |
| Seal costs 100,340 gas with the precompile (326,571 without) | `pnpm --filter @proofshot/contracts gas:seal` (Osaka, then Prague gas report), `docs/spikes/spike-b.md` |
| Every Verdict can be reproduced without our servers | `cli/` — e2e asserts the CLI and the website agree on every copy, and that the CLI reports a later key revocation just as the receipt does |
| Real WebAuthn signatures are sealed onchain in every test run | `apps/web/e2e/capture.spec.ts` (Chrome virtual authenticator + a local chain) |
| The Registry can't be re-sealed, un-sealed, or have a sealed photo re-imported; it always has exactly one admin, never also the relayer | `contracts/test/invariant/` (65k-call campaign on `main`), 100% branch coverage |
| Other carriers learn nothing from a Duplicate Alert | `apps/web/e2e/duplicates.spec.ts` (UJ-3 asserts no name, claim or image leaks) |
| Accessibility | `apps/web/e2e/a11y.spec.ts` — axe WCAG 2.1 AA, light and dark: 0 violations |
| Every requirement → code → test | `docs/traceability.md` |

## 3. The Carrier side (2 minutes, laptop)

1. Open **Carrier Console** → **Explore the demo Console** → **Northwind Mutual · adjuster** (no email; a banner
   marks it as a demo shared with other visitors, cleared after 7 days).
2. Create a Claim File, open it, and **Upload and verify** the edited copy from step 1 → **Altered** with the Tile Map.
   Find your file again later with **Find a Claim File**. Sent the link to the wrong person? **Replace link** issues a
   new one for the same Claim File; the old one stops taking photos.
3. Go back to sign-in in a private window and choose **Harbor Insurance · investigator**. Create a Claim File and
   upload the WhatsApp copy → under **Duplicate Alerts**, "Team upload 1 matches a record in another Claim File":
   *Sealed photo · another carrier*, with the date and match strength only — nothing about Northwind, its claim or
   its image. The alert links to the upload it is about.
4. Open any **Receipt** and print it (or save as PDF): full hashes and the receipt's own URL, ready for a claim file.

The same flows are in the demo video (script: `docs/demo-script.md`) and run locally via README → "Run it locally".

## Honest limits

- A Seal proves which device key signed the fingerprints and when — not that the pixels came from the camera sensor
  (hardware attestation is the next milestone) and not what the scene shows. See `docs/threat-model.md`.
- Crops beyond ~3% can't be matched by the whole-image fingerprint and come back **No Record**; a crop is never shown
  as a clean result.
- Numbers still pending a funded deployment (live `seal()` gas and latency) and a real-photo benchmark are marked ⏳ in
  `docs/submission-writeup.md`.
