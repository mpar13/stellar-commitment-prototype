#!/usr/bin/env bash
set -euo pipefail

ROOT="/workspaces/stellar-commitment-prototype/contract/commitment_contract"
cd "$ROOT"

# -----------------------------
# Always pin the local network
# -----------------------------
export STELLAR_NETWORK="local"
export STELLAR_NETWORK_PASSPHRASE="Standalone Network ; February 2017"
export STELLAR_RPC_URL="http://localhost:8000/soroban/rpc"

echo "🧹 [0/9] Starting local Stellar container..."
stellar container stop local >/dev/null 2>&1 || true
stellar container start local >/dev/null

echo "🔌 [1/9] Waiting for Soroban RPC to be ready..."
for i in $(seq 1 90); do
  if stellar ledger latest --network local >/dev/null 2>&1; then
    echo "✅ RPC ready at: $STELLAR_RPC_URL"
    break
  fi
  sleep 1
  if [ "$i" = "90" ]; then
    echo "❌ RPC not ready. Showing container logs:"
    stellar container logs local | tail -n 120 || true
    exit 1
  fi
done

echo "💰 [2/9] Funding identities on LOCAL (safe to re-run)..."
stellar keys fund admin --network local >/dev/null 2>&1 || true
stellar keys fund user1 --network local >/dev/null 2>&1 || true
stellar keys fund user2 --network local >/dev/null 2>&1 || true
echo "✅ funded admin/user1/user2"

ADMIN_ADDR="$(stellar keys address admin)"
USER2_ADDR="$(stellar keys address user2)"

echo "🪙 [3/9] Deploying/ensuring SAC token for USDC:<admin> (alias: token)..."

# Deterministic token contract id for this asset on THIS network
TOKEN_ID="$(stellar contract id asset --network local --asset "USDC:$ADMIN_ADDR")"

# Ensure the token contract is actually deployed (deploy is idempotent-ish; if already exists it may error)
# We treat errors as non-fatal and then verify existence below.
stellar contract asset deploy \
  --network local \
  --source-account admin \
  --asset "USDC:$ADMIN_ADDR" \
  --alias token >/dev/null 2>&1 || true

# Ensure alias points correctly (overwrite silently)
stellar contract alias add token --network local --id "$TOKEN_ID" >/dev/null 2>&1 || true

echo "   TOKEN_ID=$TOKEN_ID"

# IMPORTANT: your CLI version does NOT accept "--network" after "contract info"
echo "⏳ Waiting for token contract to be queryable..."
for i in $(seq 1 60); do
  if stellar contract info --id "$TOKEN_ID" >/dev/null 2>&1; then
    echo "✅ Token contract is queryable"
    break
  fi
  sleep 1
  if [ "$i" = "60" ]; then
    echo "❌ Token contract still not queryable. Logs:"
    stellar container logs local | tail -n 120 || true
    exit 1
  fi
done

echo "🛠️ [4/9] Building commitment contract WASM..."
cargo build --target wasm32v1-none --release >/dev/null
COMMIT_WASM="target/wasm32v1-none/release/commitment.wasm"
if [ ! -f "$COMMIT_WASM" ]; then
  echo "❌ Missing WASM: $COMMIT_WASM"
  exit 1
fi

echo "🚀 [5/9] Deploying commitment contract (alias: commitment)..."
COMMIT_ID="$(stellar contract deploy --network local --source-account admin --wasm "$COMMIT_WASM")"

# Replace alias to point to the new contract
stellar contract alias remove commitment --network local >/dev/null 2>&1 || true
stellar contract alias add commitment --network local --id "$COMMIT_ID" >/dev/null

echo "   COMMIT_ID=$COMMIT_ID"

echo "🔧 [6/9] Initializing commitment contract..."
stellar contract invoke \
  --network local \
  --source-account admin \
  --id "$COMMIT_ID" \
  --send=yes \
  -- \
  init \
  --admin "$ADMIN_ADDR" \
  --token_addr "$TOKEN_ID" >/dev/null

echo "🏷️ [7/9] Setting tier + making user2 eligible..."
stellar contract invoke \
  --network local \
  --source-account admin \
  --id "$COMMIT_ID" \
  --send=yes \
  -- \
  admin_set_tier \
  --tier_id 0 \
  --tier '{"lock_secs":60,"payout_early":"1","payout_mature":"5","payout_now":"5"}' >/dev/null

stellar contract invoke \
  --network local \
  --source-account admin \
  --id "$COMMIT_ID" \
  --send=yes \
  -- \
  admin_set_eligible \
  --user "$USER2_ADDR" \
  --tier_id 0 >/dev/null

echo "🤝 [8/9] Creating trustline for user2..."
stellar tx new change-trust \
  --network local \
  --source-account user2 \
  --line "USDC:$ADMIN_ADDR" \
  --limit 1000000000 \
  --build-only > trust.xdr

stellar tx sign --network local --sign-with-key user2 trust.xdr > trust.signed.xdr
stellar tx send --network local trust.signed.xdr >/dev/null

echo "🏦 [9/9] Funding commitment contract with USDC..."
# use alias "token" to avoid stale TOKEN_ID mistakes
stellar contract invoke \
  --network local \
  --source-account admin \
  --id token \
  --send=yes \
  -- \
  transfer \
  --from "$ADMIN_ADDR" \
  --to "$COMMIT_ID" \
  --amount "1000" >/dev/null

echo "🧾 Writing backend .env.local (for terminal use)..."
cat > .env.local <<ENV
export STELLAR_RPC_URL="$STELLAR_RPC_URL"
export STELLAR_NETWORK_PASSPHRASE="Standalone Network ; February 2017"
export STELLAR_NETWORK="local"
ADMIN_ADDR=$ADMIN_ADDR
TOKEN_ID=$TOKEN_ID
COMMIT_ID=$COMMIT_ID
USER2_ADDR=$USER2_ADDR
ENV

echo "✅ READY"
echo "TOKEN_ID=$TOKEN_ID"
echo "COMMIT_ID=$COMMIT_ID"
echo "Next command to test:"
echo "source .env.local && stellar contract invoke --network local --source-account user2 --id commitment --send=yes -- claim_now --user \"$USER2_ADDR\""
