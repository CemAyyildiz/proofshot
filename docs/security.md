# Security model

What the system guarantees, what it trusts, and what it does not yet do. Every guarantee below names the test that
holds it; run them with `pnpm --filter @proofshot/contracts test` (deep campaign: `FOUNDRY_PROFILE=deep`).

## Roles

| Role | Who | Can | Cannot |
|---|---|---|---|
| **Admin** (exactly one) | A cold key, never on a server | Pause/unpause all writes, allow or remove RP IDs, grant/revoke the relayer role, revoke Device Keys, hand over admin in two steps | Seal, import, or hold the relayer role |
| **Relayer** | The app server's hot key; pays all fees | Register Device Keys, submit Seals, import fingerprints, revoke Device Keys | Hold the admin role; register, seal or import while paused (revoking still works, by design) |
| **Device Key** | A passkey on the Capturer's phone | Sign Capture Records (with user verification) | Anything else — it has no account onchain |

## Guarantees (Registry)

| Guarantee | Enforced by | Test |
|---|---|---|
| A Seal needs a valid passkey signature over the whole Capture Record, with user verification | `WebAuthn.verify(…, requireUV = true)` via the P-256 precompile | `test_RejectsTamperedRecord`, `testFuzz_RejectsAnyRecordBitFlip`, `test_RejectsTamperedSignature`, `test_RejectsMissingUserVerification`, `test_RejectsWrongKey` |
| Only passkeys created for an allowed site count | RP ID hash allowlist on `authenticatorData` | `test_RejectsAssertionFromOtherRpId`, `test_RejectsShortAuthenticatorData` |
| A photo can be sealed once, and a Seal is permanent | `isSealed` | `test_RejectsReplay`, `invariant_NoReseal`, `invariant_SealedStaysSealed` |
| A sealed photo can't be re-registered as an unsigned import | `importRecords` skips sealed hashes | `test_ImportRecordsSkipsDuplicatesAndSealed`, `invariant_NoImportAfterSeal` |
| A signature is only usable for ~30 s after the block it names | `refBlock` within `MAX_LAG = 100` blocks (~300 ms each, measured) | `test_RejectsExpiredOrFutureSigningWindow`, `test_SealAcceptsFullSigningWindow` |
| A revoked Device Key can't seal again; its earlier Seals stand, and their receipts and the CLI say the key was revoked | `revokedAtBlock`, `DeviceKeyRevoked` indexed by the app and read by the CLI | `test_RevokedKeyCannotSealButEarlierSealsStand`, `test_RevokeEdgeCases`, `indexer.test.ts`, e2e `verify.spec.ts` |
| Keys are immutable once registered | `DeviceKeyExists` | `test_RegisterDeviceKeyIsRelayerOnlyAndImmutable` |
| Writes are relayer-only and stop when paused | `onlyRole`, `whenNotPaused` | `test_SealIsRelayerOnly`, `test_ImportIsRelayerOnlyAndNeedsCarrier`, `test_IncidentResponse_PauseRevokeRotate` |
| Exactly one admin; it moves only by an accepted, 1-day-delayed transfer; it can't be renounced in one call | OpenZeppelin `AccessControlDefaultAdminRules` | `test_AdminCannotBeOrphanedOrMovedInOneStep`, `invariant_ExactlyOneAdmin` |
| No account is ever both admin and relayer | `_grantRole` override | `test_RelayerAndAdminRolesNeverShareAnAccount`, `test_ConstructorRejectsAdminAsRelayer`, `invariant_NoAccountHoldsBothRoles` |
| An import batch can't exceed the per-transaction gas cap | `MAX_IMPORT_BATCH = 200` | `test_ImportBatchIsCappedAndTheCapFitsOneTransaction` |
| Deploys can't target the wrong chain, ship without RP IDs, or trust `localhost` on mainnet | `DeployRegistry` guards | `test_RefusesTheWrongChain`, `test_RefusesRpIdListsThatWouldBreakPasskeys` |

Branch coverage of `Registry.sol` is 100% (`pnpm --filter @proofshot/contracts coverage`). Slither 0.11.6 reports
nothing across all 102 detectors, and runs in CI on every push.

## Trust assumptions (v1)

- **The relayer attests context.** It puts `carrierId` and `claimRef` into the record from a valid Claim Link; the
  Capturer's signature covers them, but nothing onchain proves the link was valid. A compromised relayer could seal
  records into the wrong claim (only with a real Capturer signature) or register its own Device Keys. Response:
  runbook T-8 in [threat-model.md](threat-model.md) — pause, revoke, rotate — tested end to end in Solidity, and as
  the operator's actual `cast` commands in [runbook.md](runbook.md) (run in CI).
- **The browser origin is not checked onchain.** Binding to the site is by the RP ID hash inside `authenticatorData`,
  which the authenticator itself sets; `clientDataJSON.origin` is not compared. This is the usual WebAuthn trade-off
  and is safe as long as only the app's own hostnames are allowlisted.
- **Signatures are not domain-separated.** The challenge is `sha256(abi.encode(record))`, without the chain ID or the
  Registry address. Today only the relayer can submit, and `refBlock` pins a record to one chain's recent blocks, so a
  signature can't be carried to another network in practice; it could be submitted to a second Registry on the same
  chain within its ~30 s window, by the relayer only. **Must change before `seal()` becomes permissionless** (roadmap):
  add `block.chainid` and `address(this)` to the signed payload.
- **Pixels are not attested.** A Seal proves which key signed which fingerprints and when — not that the camera
  sensor produced them (T-1). Hardware attestation is the next milestone.

## Application safeguards

Tenant isolation on every Console query and route (e2e), hashed single-use magic links sent after the response (no
account enumeration by timing or error), `__Host-` session cookie in production, rate limits on every unauthenticated
cost keyed on the edge-set client address (a client-written `X-Forwarded-For` can't mint new buckets), a daily
sponsored-write budget per carrier (key registrations, Seals and imported images; 500 for each one-tap demo carrier)
and a daily Claim File limit per carrier and per demo visitor, a relayer fee
ceiling that pauses writes instead of overpaying, relayer writes that are broadcast at most once even when an RPC
response is lost, CSP without third-party origins, decompression-bomb refusal before
decoding (50 MP), an indexer that tolerates lagging RPCs and reorgs, and a health endpoint that alerts on low relayer
balance, a paused Registry, fees above the ceiling or missing email. Evidence images are sent `private, no-store`.
Claim Link tokens carry 192 random bits, never leave the origin in a `Referer`, and can be replaced by the Carrier
(the old token then takes no new photos but still lets already-sealed ones be delivered). They are stored as-is,
because the Console must show the link again, and like any capability URL they appear in the host's HTTP access logs;
both are accepted for v1 and limited by the link's 14-day life and replaceability. Verification Receipts are kept so shared links stay valid (FR-9); each holds the checked file's SHA-256, size and
Verdict only — never the image or its perceptual fingerprints — under an unguessable 72-bit id, and the Verifier says
so before anyone checks a file. Details and the review history:
[review/REVIEW-LOG.md](review/REVIEW-LOG.md).

## Deployment assumptions

Some guarantees above hold only if the app is deployed the way [deploy.md](deploy.md) describes:

| Assumption | Why it matters | If it is broken |
|---|---|---|
| The app runs **behind a proxy that sets `X-Real-IP`** (or appends to `X-Forwarded-For`): Railway's edge, Vercel, nginx | Rate limits key on that address | Exposed directly, a client controls the header and can mint a fresh rate-limit bucket per request |
| Request bodies **up to 20 MB** reach the app (no 4.5 MB serverless cap) | Sealed photos, verifier and Console uploads, import batches | Ordinary phone photos are rejected with 413 |
| **HTTPS** on the exact hostname allowlisted as RP ID | Passkeys and the `__Host-` cookie require it | Passkeys can't be created or used; sessions don't persist |
| A **private** image store (a host disk or a private bucket) | Evidence is served only through tenant-checked routes | A public bucket would expose every carrier's photos |
| The **admin key stays cold** (hardware wallet or encrypted keystore, never on the server) | It can pause writes and rotate a compromised relayer | A leaked admin key can do both, and grant the relayer role to an attacker-controlled address |
| `/api/health` is **monitored** | It is the alarm for low balance, a paused Registry, fees above the ceiling and missing email | Those fail silently until a Capturer hits them |

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting on this repository ("Security" → "Report a vulnerability") rather
than a public issue. Include the affected component, steps to reproduce and the impact you expect.
