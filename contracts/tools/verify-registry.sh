#!/usr/bin/env bash
# Publishes the deployed Registry's source on Monad's explorers (MonadVision, via Monad's Sourcify), so anyone can read
# the code that verifies every Seal. Reads the address from deployments/<chainId>.json, written by the deploy script.
# Sourcify matches the deployed bytecode against these sources and compiler settings; no API key or constructor
# arguments are needed.
set -euo pipefail
cd "$(dirname "$0")/.."
CHAIN=${1:?usage: verify-registry.sh <chainId: 10143 testnet | 143 mainnet>}
RECORD=deployments/$CHAIN.json
[ -f "$RECORD" ] || { echo "No $RECORD: deploy first (pnpm deploy:testnet / deploy:mainnet)." >&2; exit 1; }
ADDRESS=$(node -p "require('./$RECORD').registry")
forge verify-contract "$ADDRESS" src/Registry.sol:Registry --chain "$CHAIN" \
  --verifier sourcify --verifier-url https://sourcify-api-monad.blockvision.org/ "${@:2}"
