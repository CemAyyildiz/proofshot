# Spike B: onchain passkey verification

Story 1.4. Question: can Monad verify a WebAuthn (passkey) signature over a full Capture Record onchain, at acceptable gas and latency? Resolves PRD OQ-2.

## Confirmed API (OpenZeppelin Contracts 5.6.1)

- `WebAuthn.verify(bytes challenge, WebAuthnAuth auth, bytes32 qx, bytes32 qy, bool requireUV)`, where `WebAuthnAuth = { bytes32 r; bytes32 s; uint256 challengeIndex; uint256 typeIndex; bytes authenticatorData; string clientDataJSON }`.
- Checks: `type == "webauthn.get"`, challenge (base64url) at `challengeIndex`, UP bit, UV bit when `requireUV`, BE/BS consistency, then `P256.verify`.
- `P256.verify` calls the precompile at `0x100` (EIP-7951 / RIP-7212) and falls back to Solidity if the precompile is absent. It rejects `s > N/2`, so clients must normalise to low-s. `derToRawLowS` in `packages/shared/src/webauthn.ts` does this.
- **Not checked by OZ:** `rpIdHash` and `origin`. The browser already binds a passkey to our RP ID, so a key registered through our relayer can only sign on our origin. The production Registry (Story 3.1) will also pin `rpIdHash` as defense in depth.
- **Decision:** `requireUV = true`. Every Seal needs biometric or PIN verification, which matches FR-2 and the threat model.

## Local results (Foundry, `test/spike/PasskeySpike.t.sol`)

The fixture is a software P-256 authenticator that reproduces iCloud Keychain's byte format (DER signature, flags `UP|UV|BE|BS`).

| Check | Result |
|---|---|
| Valid assertion over `sha256(abi.encode(CaptureRecord))` seals | pass |
| Challenge encoding: TypeScript `sealChallenge` matches Solidity `sha256(abi.encode(r))` | pass |
| Tampered record, tampered signature, wrong key, unknown key, UV missing, replay, outside Signing Window | all revert with distinct errors |
| Fuzz: any single bit flip in pHash, tiles, locCommit, claimRef or width (1,024 runs) | reverts |

`seal()` gas with the full CaptureRecord (16 tiles) and the full event:

| EVM | Gas |
|---|---|
| Prague, no P256 precompile (OZ Solidity fallback) | 311,500 |
| **Osaka, EIP-7951 precompile at `0x100`, as on Monad** | **90,844** |

## Live network results

Pending. Run with a funded testnet key:

```bash
cd contracts && forge build
SPIKE_PRIVATE_KEY=0x… pnpm spike:b --samples 20
```

The script writes `docs/spikes/spike-b-testnet.json` (gas per Seal, Signing Window and p50/p95 submit-to-receipt latency).

## Real devices

Open `/spike/passkey` over HTTPS on iPhone Safari and Android Chrome, create a passkey, then tap **Sign test Seal**. Save the JSON as `contracts/test/fixtures/webauthn-<device>.json` and add a test case that loads it.

## Decisions (applied in Story 3.1, `contracts/src/Registry.sol`)

- **`seal()` is relayer-only in v1.** The Device Key signature proves the device took the photo. But the relayer attests `carrierId` and `claimRef`, after it validates the Claim Link. If `seal()` were permissionless, anyone holding a key could attribute Seals to any Carrier and pollute Duplicate Alerts. A permissionless `seal()` becomes possible once the Claim Link binding is itself signed onchain.
- **`rpIdHash` allowlist.** The admin manages it, so dev, preview and production RP IDs can be enabled independently.
- **Device Key revocation (T-7).** A revoked key cannot seal from the revocation block on. Earlier Seals stay valid.
- **Production `seal()` gas: 100,315** with the precompile (Osaka): the spike plus RP ID, revocation and pause checks.
- **Go/no-go:** **go** for onchain verification. The testnet run will confirm it on the live precompile.
