#!/bin/bash

# Rename @atproto to @creatonproto across the entire codebase
# This script should be run from the repository root

set -e

echo "=== Renaming @atproto to @creatonproto ==="

# 1. Rename in package.json files (package names and dependencies)
echo "Updating package.json files..."
find . -name "package.json" -not -path "./node_modules/*" -exec sed -i '' \
    -e 's/"@atproto\//"@creatonproto\//g' \
    -e 's/"@atproto-labs\//"@creatonproto-labs\//g' \
    {} \;

# 2. Rename in TypeScript/JavaScript files (imports)
echo "Updating TypeScript/JavaScript imports..."
find . \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" -o -name "*.mjs" -o -name "*.cjs" \) \
    -not -path "./node_modules/*" \
    -not -path "./packages/*/node_modules/*" \
    -exec sed -i '' \
    -e "s/'@atproto\//'@creatonproto\//g" \
    -e 's/"@atproto\//"@creatonproto\//g' \
    -e "s/'@atproto-labs\//'@creatonproto-labs\//g" \
    -e 's/"@atproto-labs\//"@creatonproto-labs\//g' \
    {} \;

# 3. Rename in Markdown files
echo "Updating Markdown files..."
find . -name "*.md" -not -path "./node_modules/*" -exec sed -i '' \
    -e 's/@atproto\//@creatonproto\//g' \
    -e 's/@atproto-labs\//@creatonproto-labs\//g' \
    {} \;

# 4. Rename in JSON files (tsconfig, etc)
echo "Updating JSON config files..."
find . \( -name "tsconfig*.json" -o -name "*.jsonc" \) \
    -not -path "./node_modules/*" \
    -exec sed -i '' \
    -e 's/@atproto\//@creatonproto\//g' \
    -e 's/@atproto-labs\//@creatonproto-labs\//g' \
    {} \;

# 5. Update YAML files
echo "Updating YAML files..."
find . \( -name "*.yaml" -o -name "*.yml" \) \
    -not -path "./node_modules/*" \
    -exec sed -i '' \
    -e 's/@atproto\//@creatonproto\//g' \
    -e 's/@atproto-labs\//@creatonproto-labs\//g' \
    {} \;

# 6. Update Dockerfile files
echo "Updating Dockerfiles..."
find . -name "Dockerfile*" -not -path "./node_modules/*" -exec sed -i '' \
    -e 's/@atproto\//@creatonproto\//g' \
    -e 's/@atproto-labs\//@creatonproto-labs\//g' \
    {} \;

# 7. Update Makefile
echo "Updating Makefile..."
if [ -f "Makefile" ]; then
    sed -i '' \
        -e 's/@atproto\//@creatonproto\//g' \
        -e 's/@atproto-labs\//@creatonproto-labs\//g' \
        Makefile
fi

echo ""
echo "=== Renaming complete! ==="
echo ""
echo "Next steps:"
echo "1. Run 'rm -rf node_modules && rm bun.lock && bun install' to reinstall dependencies"
echo "2. Run 'bun run build' to verify the build works"
echo "3. Create the @creatonproto organization on npm"
echo "4. Update repository URLs if needed"
