#!/usr/bin/env node
/**
 * Custom script to handle the copying of WASM files for @martel/audio-file-decoder
 * This script checks if the files exist and creates directories if needed
 */

const fs = require('fs');
const path = require('path');

// Define paths
const sourceFile = path.resolve(process.cwd(), 'node_modules/@martel/audio-file-decoder/decode-audio.wasm');
const targetDir = path.resolve(process.cwd(), 'node_modules/@martel/audio-file-decoder/dist');
const targetFile = path.resolve(targetDir, 'decode-audio.wasm');

// Function to copy file
function copyFile() {
  try {
    // Check if source file exists
    if (!fs.existsSync(sourceFile)) {
      console.log('Source WASM file not found, skipping copy operation');
      return;
    }

    // Create target directory if it doesn't exist
    if (!fs.existsSync(targetDir)) {
      console.log(`Creating directory: ${targetDir}`);
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // Check if target file already exists
    if (fs.existsSync(targetFile)) {
      console.log('Target WASM file already exists, skipping copy operation');
      return;
    }

    // Copy the file
    fs.copyFileSync(sourceFile, targetFile);
    console.log(`Successfully copied ${sourceFile} to ${targetFile}`);
  } catch (error) {
    console.error('Warning: Error during WASM file copy operation:', error.message);
    // Don't fail the install process
  }
}

// Execute
copyFile(); 