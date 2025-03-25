#!/usr/bin/env node

/**
 * This script verifies that the package is correctly built and includes the dist directory.
 * Run it after building to check if the package is ready for publishing.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Define paths
const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.resolve(ROOT_DIR, 'dist');
const PACKAGE_JSON = path.resolve(ROOT_DIR, 'package.json');

console.log('Verifying package...');

// Check if package.json exists
if (!fs.existsSync(PACKAGE_JSON)) {
  console.error('Error: package.json not found');
  process.exit(1);
}

// Check if dist directory exists
if (!fs.existsSync(DIST_DIR)) {
  console.error('Error: dist directory not found');
  process.exit(1);
}

// Check if dist directory is not empty
const distFiles = fs.readdirSync(DIST_DIR);
if (distFiles.length === 0) {
  console.error('Error: dist directory is empty');
  process.exit(1);
}

console.log('Dist directory contains:');
try {
  console.log(execSync(`ls -la ${DIST_DIR}`).toString());
} catch (err) {
  console.error('Error listing dist directory:', err);
  process.exit(1);
}

// Check if package.json is properly configured
try {
  const pkg = require(PACKAGE_JSON);
  
  console.log('Package name:', pkg.name);
  console.log('Package version:', pkg.version);
  
  if (!pkg.files || !pkg.files.includes('dist')) {
    console.error('Error: package.json does not include "dist" in the "files" field');
    process.exit(1);
  }
  
  if (!pkg.main || !pkg.main.startsWith('dist/')) {
    console.error('Error: package.json "main" field does not point to the dist directory');
    process.exit(1);
  }
  
  console.log('Package "files" field:', pkg.files);
  console.log('Package "main" field:', pkg.main);
  
  // Create a dry-run pack to check what would be included
  console.log('\nPerforming a dry-run npm pack to verify package contents:');
  const packOutput = execSync('npm pack --dry-run', { cwd: ROOT_DIR }).toString();
  console.log(packOutput);
  
  // Check if "dist" is mentioned in the pack output
  if (!packOutput.includes('dist/')) {
    console.error('Warning: "dist" directory might not be included in the package');
    console.log('This could mean that the npm pack command is not including the dist directory.');
    console.log('Check the npm packaging process.');
  }
  
  console.log('\nVerification completed successfully. Package is ready for publishing.');
} catch (err) {
  console.error('Error verifying package:', err);
  process.exit(1);
} 