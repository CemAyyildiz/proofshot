# Threat model

What a Seal proves: (a) a specific Device Key signed these fingerprints; (b) within the Signing Window; (c) whether the
image changed since, and where; (d) whether the same visual content already exists elsewhere in the Registry.

What it does not prove: that the pixels came from the device's camera sensor, that the scene is what the Capturer says
it is, or who the Capturer is legally.

| # | Threat | v1 stance | Planned |
|---|---|---|---|
| T-1 | Virtual camera or injected frames feed a fabricated image to the capture screen | Accepted, disclosed. Duplicate and alteration detection still apply. | Native capture with iOS App Attest / Android Play Integrity bound into the signed payload |
| T-2 | Re-photographing a screen or print of a recycled image | Partly mitigated: the perceptual hash often matches the original, raising a Duplicate Alert | Recapture (moiré/screen) detection |
| T-3 | Replaying a signed payload | Rejected: duplicate Exact Hash, Signing Window bounds | — |
| T-4 | Draining sponsored fees with scripted Seals | Rate limits per Claim Link, per Device Key, per sandbox visitor, per carrier import | Per-carrier fee budgets |
| T-5 | Probing the Registry to learn about other carriers' claims | Alerts reveal only match strength, date and same/other carrier; carrier IDs are pseudonymous | Rotating pseudonymous IDs |
| T-6 | Adversarial perturbation to evade perceptual matching of a recycled image | Accepted | Multiple fingerprint algorithms, region-level matching |
| T-7 | Lost or compromised Device Key | Keys can be revoked from a block on; earlier Seals stay valid | Key revocation UI |
| T-8 | Compromised relayer key (it attests carrier and claim) | Admin is a separate cold key: pause all writes, revoke the relayer role and its Device Keys, rotate, unpause (tested) | Carrier-signed Claim Links onchain, permissionless `seal()` |
| T-9 | Crop + edit to hide an alteration | A crop disables the Alteration Check and the Verdict says so at full weight — never a clean result | Crop-robust centre hash |

Application safeguards: tenant isolation on every Console query and route (tested), hashed single-use magic links with
rate limits, CSP without third-party origins, `frame-ancestors 'none'`, `Referrer-Policy: same-origin` (Claim Link tokens
never leak), camera and location permission limited to the app's own origin.
