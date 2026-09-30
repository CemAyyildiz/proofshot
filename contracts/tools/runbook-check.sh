#!/usr/bin/env bash
# Executes every step of docs/runbook.md, verbatim and in order, against a throwaway Anvil with a fresh Registry,
# and checks the chain state after each one. Keeps the runbook honest: a command that doesn't work fails here.
set -euo pipefail
cd "$(dirname "$0")/.."
DOC=../docs/runbook.md
PORT=${RUNBOOK_PORT:-8577}
export RPC=http://127.0.0.1:$PORT

anvil --hardfork osaka --gas-limit 16777216 --port "$PORT" --silent &
ANVIL=$!
trap 'kill $ANVIL 2>/dev/null' EXIT
for _ in $(seq 50); do cast chain-id --rpc-url "$RPC" >/dev/null 2>&1 && break; sleep 0.1; done

# Anvil's dev accounts: #0 deploys, #2 is the admin, #1 the relayer, #3 the new relayer, #4 the new admin.
key() { cast wallet private-key --mnemonic "test test test test test test test test test test test junk" --mnemonic-index "$1"; }
addr() { cast wallet address --private-key "$(key "$1")"; }
export ADMIN_SIGNER="--private-key $(key 2)"
export NEW_ADMIN_SIGNER="--private-key $(key 4)"
export RELAYER=$(addr 1)
export NEW_RELAYER=$(addr 3)
export NEW_ADMIN=$(addr 4)
export RELAYER_ROLE=$(cast keccak RELAYER_ROLE)

export REGISTRY=0x5FbDB2315678afecb367f032d93F642f64180aa3 # first contract of Anvil account #0
# Deploy through the real script; its deployment record and broadcast log are discarded afterwards.
EXPECTED_CHAIN_ID=31337 REGISTRY_ADMIN=$(addr 2) REGISTRY_RELAYER=$RELAYER REGISTRY_RP_IDS=localhost \
  forge script script/DeployRegistry.s.sol --rpc-url "$RPC" --private-key "$(key 0)" --broadcast >/dev/null
rm -f deployments/31337.json; rm -rf broadcast/DeployRegistry.s.sol/31337 cache/DeployRegistry.s.sol/31337

# A Device Key the "compromised" relayer registered.
export SUSPECT_KEY_ID=$(cast keccak suspect-credential)
cast send "$REGISTRY" "registerDeviceKey(bytes32,bytes32,bytes32)" "$SUSPECT_KEY_ID" "0x$(printf '%064x' 1)" "0x$(printf '%064x' 2)" --private-key "$(key 1)" --rpc-url "$RPC" >/dev/null

step() { # run the ```sh block that follows <!-- step:$1 --> in the runbook
  local code
  code=$(awk -v tag="<!-- step:$1 -->" '$0==tag{f=1;next} f&&/^```sh/{b=1;next} b&&/^```/{exit} b{print}' "$DOC")
  [ -n "$code" ] || { echo "runbook step '$1' not found" >&2; exit 1; }
  echo "── $1"
  # Keep what an operator reads: call results and each transaction's status line.
  bash -euo pipefail -c "$code" | grep -E '^(status|true|false|0x[0-9a-fA-F]{40}$|[0-9])' | sed 's/^/   /'
}
is() { local got; got=$(cast call "$REGISTRY" "$1" "${@:3}" --rpc-url "$RPC"); [ "$got" = "$2" ] || { echo "expected $1 = $2, got $got" >&2; exit 1; }; }

step status
step pause;        is "paused()(bool)" true
step revoke;       is "hasRole(bytes32,address)(bool)" false "$RELAYER_ROLE" "$RELAYER"
                   [ "$(cast call "$REGISTRY" "deviceKey(bytes32)((bytes32,bytes32,uint64))" "$SUSPECT_KEY_ID" --rpc-url "$RPC" | grep -o '[0-9]*)$' | tr -d ')')" != 0 ]
step rotate;       is "hasRole(bytes32,address)(bool)" true "$RELAYER_ROLE" "$NEW_RELAYER"
step unpause;      is "paused()(bool)" false
step rpid;         is "allowedRpIdHash(bytes32)(bool)" true "0x$(printf '%s' preview.proofshot.app | shasum -a 256 | cut -c1-64)"
step admin-begin
cast rpc evm_increaseTime 86401 --rpc-url "$RPC" >/dev/null && cast rpc evm_mine --rpc-url "$RPC" >/dev/null
step admin-accept; is "defaultAdmin()(address)" "$NEW_ADMIN"
echo "runbook OK: every step ran and left the expected state"
