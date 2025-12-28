#!/usr/bin/env bash
set -e

echo "🧹 Resetting local Stellar network..."
./scripts/reset-local.sh

echo "🏗️  Building commitment contract..."
cargo build --target wasm32v1-none --release

echo "🏗️  Building token contract..."
cd ../token
cargo build --target wasm32v1-none --release
cd ../commitment_contract

echo "🚀 Deploying token contract..."
TOKEN_ID=$(stellar contract deploy \
  --network local \
  --source-account admin \
  --wasm ../token/target/wasm32v1-none/release/token.wasm)

echo "TOKEN_ID=$TOKEN_ID"

echo "🚀 Deploying commitment contract..."
COMMIT_ID=$(stellar contract deploy \
  --network local \
  --source-account admin \
  --wasm target/wasm32v1-none/release/commitment_contract.wasm)

echo "COMMIT_ID=$COMMIT_ID"

ADMIN_ADDR=$(stellar keys address admin)

cat > .env.local <<EOF
TOKEN_ID=$TOKEN_ID
COMMIT_ID=$COMMIT_ID
ADMIN_ADDR=$ADMIN_ADDR
EOF

echo "✅ Saved .env.local"
echo "🎉 Deployment complete!"
echo ""
echo "Next steps:"
echo "  source .env.local"
echo "  stellar contract invoke --network local --source-account admin --id \$COMMIT_ID -- <fn>"
