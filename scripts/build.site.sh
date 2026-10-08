#!/bin/bash

# Lilka Repository Build Script
# This script builds the static site and JSON files

set -e  # Exit on error

echo "🚀 Starting Lilka Repository Build..."
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo -e "${BLUE}📂 Project Directory: ${PROJECT_DIR}${NC}"
echo ""

# Step 1: Build JSON files
echo -e "${YELLOW}Step 1/3: Building JSON files from manifests...${NC}"
cd "$PROJECT_DIR"
python3 build.py --build

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ JSON files built successfully${NC}"
else
    echo "❌ Failed to build JSON files"
    exit 1
fi
echo ""

# Step 2: Copy static site files to build directory
echo -e "${YELLOW}Step 2/3: Copying static site files...${NC}"

# Create build directory if it doesn't exist
mkdir -p "$PROJECT_DIR/build"

# Copy HTML, CSS, JS files
cp "$PROJECT_DIR/site/index.html" "$PROJECT_DIR/build/"
cp "$PROJECT_DIR/site/styles.css" "$PROJECT_DIR/build/"
cp "$PROJECT_DIR/site/script.js" "$PROJECT_DIR/build/"
cp "$PROJECT_DIR/README.md" "$PROJECT_DIR/build/"
cp "$PROJECT_DIR/README.uk.md" "$PROJECT_DIR/build/"

echo -e "${GREEN}✓ Static site files copied to build/${NC}"
echo ""

# Step 3: Verify build
echo -e "${YELLOW}Step 3/3: Verifying build...${NC}"

# Check if required files exist
REQUIRED_FILES=(
    "build/index.html"
    "build/styles.css"
    "build/script.js"
    "build/apps/index_0.json"
    "build/wallpapers/index_0.json"
    "build/mods/index_0.json"
)

ALL_GOOD=true
for file in "${REQUIRED_FILES[@]}"; do
    if [ -f "$PROJECT_DIR/$file" ]; then
        echo -e "${GREEN}✓${NC} $file"
    else
        echo -e "❌ Missing: $file"
        ALL_GOOD=false
    fi
done

echo ""

if [ "$ALL_GOOD" = true ]; then
    echo -e "${GREEN}🎉 Build completed successfully!${NC}"
    echo ""
    echo "To view the site locally, run:"
    echo -e "${BLUE}  cd $PROJECT_DIR/build${NC}"
    echo -e "${BLUE}  python3 -m http.server 8000${NC}"
    echo ""
    echo "Then open: http://localhost:8000"
else
    echo "❌ Build completed with errors"
    exit 1
fi
