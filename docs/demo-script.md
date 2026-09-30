# Demo script (≤ 3 minutes)

Aligned with the shipped UI; labels in quotes are exactly what appears on screen. Record the live parts in one take on
the deployed app (mainnet), phone on the left, laptop on the right.

**Before recording:** two Console tabs signed in (Northwind Mutual as Marcus, Harbor Insurance as Dana); a Claim File
"HAIL-2026-0931" at Northwind with its Claim Link open on the phone; WhatsApp on the phone; an image editor ready with
the inpaint brush.

| Time | Screen | Action and line |
|---|---|---|
| 0:00–0:20 | Two photos side by side | "One of these hail dents is real. One was added by an AI editor in ten seconds." ⏳ Optional statistic, only after re-checking the source (PRD §5 cites Verisk, March 2026: "99% have already received manipulated documentation"). |
| 0:20–0:50 | Phone | Tap the Claim Link → "Take photos of the damage" → "Continue" → Face ID → take 3 photos. Each shows "Sealing…" then "Sealed ✓ · 0.x s". Tap "Send 3 photos to insurer" → "Sent to your insurer". "No app, no wallet, no crypto words — and every photo was signed on the device and verified onchain." |
| 0:50–1:25 | Phone → laptop | Send one photo to yourself on WhatsApp, save the compressed copy, drop it into "Verify a photo". Verdict **Derived Copy**: "A re-saved copy of a photo sealed … No regions were changed." Open the Verification Receipt: Signing Window, "a carrier", "Verify it yourself". |
| 1:25–1:55 | Laptop, Northwind Console | Paint a dent into the same photo, open the Claim File, "Upload and verify". Verdict **Altered**, Tile Map highlights the edited region: "1 of 16 regions differ from the sealed photo." |
| 1:55–2:25 | Laptop, Harbor Console | Create "HB-2026-0417", upload the WhatsApp copy. Under **Duplicate Alerts**: "Team upload 1 matches a record in another Claim File" — "Sealed photo · another carrier" with the date and match strength; the link jumps to the upload. "Harbor never saw Northwind's photo, customer or claim. They shared fingerprints, not photos." |
| 2:25–3:00 | Slide | Measured numbers (gas per Seal, p95 seal latency, benchmark recall, Seals and Device Keys on mainnet), the one-liner, and the roadmap: hardware attestation → claims-system connectors → carrier consortium. |

Fallbacks: if the RPC stalls, the Verifier says the registry is unreachable rather than guessing — cut and retake.
Keep a pre-recorded version of 0:20–0:50 in case Face ID misfires on camera.
