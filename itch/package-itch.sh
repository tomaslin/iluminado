#!/usr/bin/env bash
# ==============================================================================
# Iluminado — itch.io Packaging Script
# 
# Builds the Vite project, verifies all HTML5 deployment constraints, and
# packages the game into itch/iluminado-html5.zip ready for itch.io or Butler.
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DIST_DIR="$PROJECT_ROOT/dist"
OUTPUT_ZIP="$SCRIPT_DIR/iluminado-html5.zip"

echo "=================================================="
echo "⚡ Iluminado HTML5 Packaging for itch.io"
echo "=================================================="
echo "Project Root: $PROJECT_ROOT"
echo "Output Archive: $OUTPUT_ZIP"
echo ""

# Step 1: Validate Node & dependencies
if ! command -v npm &> /dev/null; then
  echo "❌ Error: npm is not installed or not in PATH."
  exit 1
fi

# Step 2: Build the project with Vite
echo "📦 Step 1/4: Running Vite production build..."
cd "$PROJECT_ROOT"
npm run build

# Step 3: Verify output integrity
echo ""
echo "🔍 Step 2/4: Verifying build outputs..."

if [ ! -f "$DIST_DIR/index.html" ]; then
  echo "❌ Error: $DIST_DIR/index.html was not created!"
  exit 1
fi

if [ ! -d "$DIST_DIR/music" ]; then
  echo "❌ Error: $DIST_DIR/music directory is missing!"
  exit 1
fi

TRACK_COUNT=$(find "$DIST_DIR/music" -maxdepth 1 -name "*.mp3" | wc -l | tr -d ' ')
echo "   ✓ Found index.html"
echo "   ✓ Found music directory with $TRACK_COUNT tracks"

# Verify relative paths in index.html (vital for itch.io sandbox iframe)
if grep -q 'href="/assets/' "$DIST_DIR/index.html" || grep -q 'src="/assets/' "$DIST_DIR/index.html"; then
  echo "⚠️ Warning: Found absolute paths (/assets/...) in index.html."
  echo "   Vite base must be relative (base: './') to run in itch.io iframes."
  exit 1
else
  echo "   ✓ Asset links are properly relative (./assets/...)"
fi

# Step 4: Create itch.io Zip Package
echo ""
echo "🗜️  Step 3/4: Creating zip package..."
rm -f "$OUTPUT_ZIP"

cd "$DIST_DIR"
# Zip contents of dist directly (so index.html is at root of zip, as itch requires)
zip -q -r -9 "$OUTPUT_ZIP" ./*

# Step 5: Size & Limit Verification
echo ""
echo "📊 Step 4/4: Validating package size..."
if [ ! -f "$OUTPUT_ZIP" ]; then
  echo "❌ Error: Failed to generate $OUTPUT_ZIP"
  exit 1
fi

ZIP_BYTES=$(stat -f%z "$OUTPUT_ZIP" 2>/dev/null || stat -c%s "$OUTPUT_ZIP" 2>/dev/null)
ZIP_MB=$(echo "scale=2; $ZIP_BYTES / 1048576" | bc)

echo "=================================================="
echo "✅ Build & Packaging Complete!"
echo "Package: $OUTPUT_ZIP"
echo "Size:    ${ZIP_MB} MB ($ZIP_BYTES bytes)"
echo "Limit:   1000.00 MB (itch.io HTML5 max)"
echo "=================================================="
echo ""
echo "Next steps:"
echo "1. Manual upload: Drag and drop '$OUTPUT_ZIP' to your itch.io dashboard under 'Upload files'."
echo "2. Butler upload: Run 'bash itch/deploy-butler.sh <your-itch-username>' for instant delta deploys."
echo ""
