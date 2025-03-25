#!/bin/bash

# This script handles the publishing process for the @pareto-engineering/editor package

if [ -z $1 ]; then
  echo "Provide a new version as a first argument"
  exit 1
fi

TOKEN=$1
VERSION=$2
COMPANY="pareto-engineering"
REPO="label-studio-mono"

# Colors for colored output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Just to be sure
git pull

# Patch version
sed -E -e "s/^  \"version\".*$/  \"version\": \"$VERSION\",/" -i '' package.json
git add package.json

echo && echo -e "${GREEN}### Package.json updated successfully${NC}" && echo

# Create release commit and tag and push them
git commit -m "Release editor v$VERSION"
git tag v$VERSION

git push
git push origin v$VERSION

echo && echo -e "${GREEN}### Release commit and tag pushed to github${NC}" && echo

# Build the package
npm run build:editor

# Check if dist directory exists and is not empty
if [ ! -d "dist" ] || [ -z "$(ls -A dist)" ]; then
  echo -e "${RED}### Error: dist directory is missing or empty${NC}"
  echo "Building package again to ensure dist is created..."
  
  # Force rebuild
  node scripts/build-module.js
  
  # Check again
  if [ ! -d "dist" ] || [ -z "$(ls -A dist)" ]; then
    echo -e "${RED}### Error: Failed to create dist directory. Aborting publish.${NC}"
    exit 1
  fi
fi

echo -e "${GREEN}### dist directory exists and contains files:${NC}"
ls -la dist

# Verify package integrity
echo -e "${YELLOW}### Verifying package integrity...${NC}"
node scripts/verify-package.js
if [ $? -ne 0 ]; then
  echo -e "${RED}### Package verification failed. Aborting publish.${NC}"
  exit 1
fi

# Authenticate within npmjs.com using Access Token from NPMJS_TOKEN
echo "//registry.npmjs.org/:_authToken=${TOKEN}" > ".npmrc"

# Create a dry-run tarball to verify content
echo -e "${YELLOW}### Verifying package contents before publishing...${NC}"
npm pack --dry-run

# Publish the package
echo -e "${YELLOW}### Publishing package...${NC}"
npm publish

echo && echo -e "${GREEN}### NPM package published${NC}" && echo

# Clean up
git checkout -- package.json
rm -rf .npmrc

echo && echo -e "${GREEN}### Cleanup completed${NC}" && echo
