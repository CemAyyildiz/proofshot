# Admin runbook

Every command here is executed, in this order, against a throwaway local chain by
`pnpm --filter @proofshot/contracts runbook:check` — the page can't drift from what works.

Set these first. `ADMIN_SIGNER` is how `cast` reaches the **cold** admin key: a hardware wallet (`--ledger`) or an
encrypted keystore (`--account admin`, created with `cast wallet import admin --interactive`). Never paste the admin
private key into a shell.

```sh
export RPC=https://rpc.monad.xyz            # or https://testnet-rpc.monad.xyz
export REGISTRY=0x…                          # contracts/deployments/<chainId>.json → registry
export ADMIN_SIGNER="--ledger"               # or: --account admin
export RELAYER_ROLE=$(cast keccak RELAYER_ROLE)
```

## Status

<!-- step:status -->
```sh
cast call $REGISTRY "paused()(bool)" --rpc-url $RPC
cast call $REGISTRY "defaultAdmin()(address)" --rpc-url $RPC
cast call $REGISTRY "hasRole(bytes32,address)(bool)" $RELAYER_ROLE $RELAYER --rpc-url $RPC
```

`/api/health` shows the same from the app's side (relayer balance, paused, problems).

## Incident: the relayer key may be compromised (threat model T-8)

1. **Stop all writes.** Reads, receipts and past Seals are unaffected.

<!-- step:pause -->
```sh
cast send $REGISTRY "pause()" $ADMIN_SIGNER --rpc-url $RPC
```

2. **Cut off the old relayer**, and any Device Key it may have registered (repeat per `keyId`; keys are listed by
   `DeviceKeyRegistered` events).

<!-- step:revoke -->
```sh
cast send $REGISTRY "revokeRole(bytes32,address)" $RELAYER_ROLE $RELAYER $ADMIN_SIGNER --rpc-url $RPC
cast send $REGISTRY "revokeDeviceKey(bytes32)" $SUSPECT_KEY_ID $ADMIN_SIGNER --rpc-url $RPC
```

3. **Install a fresh relayer.** Create it with `cast wallet new`, fund it with MON, put its key in the host's
   `RELAYER_PRIVATE_KEY`, redeploy the app, then grant the role. (The contract refuses if this address is the admin.)

<!-- step:rotate -->
```sh
cast send $REGISTRY "grantRole(bytes32,address)" $RELAYER_ROLE $NEW_RELAYER $ADMIN_SIGNER --rpc-url $RPC
```

4. **Resume.**

<!-- step:unpause -->
```sh
cast send $REGISTRY "unpause()" $ADMIN_SIGNER --rpc-url $RPC
```

## Allow a new hostname (e.g. a preview deployment)

Passkeys are bound to the hostname they were created on. The Registry accepts only allowlisted ones, stored as
`sha256(hostname)`:

<!-- step:rpid -->
```sh
export RP_ID=preview.proofshot.app
cast send $REGISTRY "setRpIdHash(bytes32,bool)" 0x$(printf '%s' "$RP_ID" | shasum -a 256 | cut -c1-64) true $ADMIN_SIGNER --rpc-url $RPC
cast call $REGISTRY "allowedRpIdHash(bytes32)(bool)" 0x$(printf '%s' "$RP_ID" | shasum -a 256 | cut -c1-64) --rpc-url $RPC
```

Use `false` instead of `true` to remove one.

## Hand the admin role to a new key

Two steps, at least `ADMIN_TRANSFER_DELAY` (1 day) apart; the new key must accept. Until then the old admin can
cancel with `cancelDefaultAdminTransfer()`.

<!-- step:admin-begin -->
```sh
cast send $REGISTRY "beginDefaultAdminTransfer(address)" $NEW_ADMIN $ADMIN_SIGNER --rpc-url $RPC
cast call $REGISTRY "pendingDefaultAdmin()(address,uint48)" --rpc-url $RPC
```

After the delay, from the **new** admin key:

<!-- step:admin-accept -->
```sh
cast send $REGISTRY "acceptDefaultAdminTransfer()" $NEW_ADMIN_SIGNER --rpc-url $RPC
```
