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
