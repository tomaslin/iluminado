#!/usr/bin/env bash
# ==============================================================================
# Iluminado — Butler CLI Push Deployment Script
#
# Usage:
#   ./itch/deploy-butler.sh [ITCH_USERNAME] [VERSION]
#
# Examples:
#   ./itch/deploy-butler.sh myusername 1.0.0
#   ITCH_USER=myusername ./itch/deploy-butler.sh
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DIST_DIR="$PROJECT_ROOT/dist"

ITCH_USER="${1:-${ITCH_USER:-}}"
VERSION="${2:-${GAME_VERSION:-1.0.0}}"
GAME_SLUG="iluminado"
CHANNEL="html5"

echo "=================================================="
echo "🚀 Iluminado Butler Deployment"
echo "=================================================="

# Check if Butler CLI is installed
if ! command -v butler &> /dev/null; then
  echo "❌ Error: 'butler' command not found."
  echo "   Install Butler:"
  echo "     macOS: brew install itch/itch/butler"
  echo "     Other: see itch/butler.md"
  exit 1
fi

# Ensure itch username is provided
if [ -z "$ITCH_USER" ]; then
  echo "❌ Error: itch.io username not provided."
  echo "   Usage: $0 <itch-username> [version]"
  echo "   Or: export ITCH_USER=<itch-username>"
  exit 1
fi

TARGET="$ITCH_USER/$GAME_SLUG:$CHANNEL"

# Build project
echo "📦 Building production bundle with Vite..."
cd "$PROJECT_ROOT"
npm run build

# Verify build outputs
if [ ! -f "$DIST_DIR/index.html" ]; then
  echo "❌ Error: $DIST_DIR/index.html missing after build."
  exit 1
fi

echo ""
echo "🎯 Target:       $TARGET"
echo "🏷️  User Version: $VERSION"
echo ""

# Execute Butler push
echo "📤 Uploading to itch.io via Butler..."
butler push "$DIST_DIR" "$TARGET" --userversion "$VERSION"

echo ""
echo "=================================================="
echo "✅ Deployment successful to itch.io!"
echo "Check your game page at: https://$ITCH_USER.itch.io/$GAME_SLUG"
echo "=================================================="
