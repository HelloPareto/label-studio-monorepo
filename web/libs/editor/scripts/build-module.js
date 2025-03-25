#!/usr/bin/env node

/**
 * This script creates proper entry point files for the package after building.
 * It ensures that the package can be easily imported in other projects.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Define paths
const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.resolve(ROOT_DIR, 'dist');
const LIBS_EDITOR_DIST = path.resolve(ROOT_DIR, '..', '..', 'dist', 'libs', 'editor');

// Ensure the dist directory exists
console.log(`Ensuring dist directory exists at: ${DIST_DIR}`);
if (!fs.existsSync(DIST_DIR)) {
  try {
    fs.mkdirSync(DIST_DIR, { recursive: true });
    console.log('Created dist directory successfully');
  } catch (err) {
    console.error('Failed to create dist directory:', err);
    process.exit(1);
  }
}

// Run the build command
console.log('Building the editor package...');
try {
  execSync('nx run editor:build:production', { stdio: 'inherit', cwd: path.resolve(ROOT_DIR, '..', '..') });
} catch (error) {
  console.error('Build failed:', error);
  process.exit(1);
}

// Check if the build output exists
console.log(`Checking for build output at: ${LIBS_EDITOR_DIST}`);
if (fs.existsSync(LIBS_EDITOR_DIST)) {
  console.log('Build output found. Copying built files to dist directory...');
  
  // Recursive function to copy directories
  function copyDir(src, dest) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    
    const entries = fs.readdirSync(src, { withFileTypes: true });
    
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      
      if (entry.isDirectory()) {
        copyDir(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }
  
  try {
    // Clear the dist directory before copying new files
    const files = fs.readdirSync(DIST_DIR);
    for (const file of files) {
      const filePath = path.join(DIST_DIR, file);
      if (fs.lstatSync(filePath).isDirectory()) {
        fs.rmSync(filePath, { recursive: true, force: true });
      } else {
        fs.unlinkSync(filePath);
      }
    }
    
    // Copy all the files
    copyDir(LIBS_EDITOR_DIST, DIST_DIR);
    console.log('Files copied successfully');
  } catch (err) {
    console.error('Error copying files:', err);
    process.exit(1);
  }
} else {
  console.error(`Build output not found at ${LIBS_EDITOR_DIST}. Build may have failed.`);
  console.log('Current directory structure:');
  try {
    const rootDist = path.resolve(ROOT_DIR, '..', '..');
    if (fs.existsSync(rootDist)) {
      console.log('Files in web directory:');
      console.log(execSync(`ls -la ${rootDist}`).toString());
      
      const distDir = path.resolve(rootDist, 'dist');
      if (fs.existsSync(distDir)) {
        console.log('Files in dist directory:');
        console.log(execSync(`ls -la ${distDir}`).toString());
      }
    }
  } catch (err) {
    console.error('Error listing directory:', err);
  }
  process.exit(1);
}

// Create the CJS entry point
console.log('Creating CommonJS entry point...');
const cjsEntryPoint = `
'use strict';

if (process.env.NODE_ENV === 'production') {
  module.exports = require('./static/js/main.js');
} else {
  module.exports = require('./static/js/main.js');
}
`;

// Create the ESM entry point
console.log('Creating ESM entry point...');
const esmEntryPoint = `
export * from './static/js/main.js';
export { default } from './static/js/main.js';
`;

// Create TypeScript definitions
console.log('Creating TypeScript definitions...');
const dtsEntryPoint = `
export interface LabelStudioOptions {
  config: string;
  interfaces?: string[];
  user?: {
    id?: number | string;
    firstName?: string;
    lastName?: string;
  };
  task?: any;
  keymap?: Record<string, string>;
  description?: string;
  interfaces?: string[];
  messages?: Record<string, string>;
  onSubmitAnnotation?: (annotation: any) => void;
  onUpdateAnnotation?: (annotation: any) => void;
  onDeleteAnnotation?: (annotation: any) => void;
  onSkipTask?: () => void;
  onUnskipTask?: () => void;
  onSubmitDraft?: (annotation: any) => void;
  onTaskLoad?: (task: any) => void;
  onLabelStudioLoad?: (ls: any) => void;
  onEntityCreate?: (entity: any) => void;
  onEntityDelete?: (entity: any) => void;
  onSelectAnnotation?: (annotation: any) => void;
  onPanelChange?: (panel: string) => void;
}

export class LabelStudio {
  constructor(rootElement: HTMLElement | string, options: LabelStudioOptions);
  
  async submitAnnotation(): Promise<any>;
  async updateAnnotation(annotationID: string, body: any): Promise<any>;
  async deleteAnnotation(annotationID: string): Promise<void>;
  
  root: HTMLElement;
  options: LabelStudioOptions;
}

export default LabelStudio;
`;

// Write the entry point files
try {
  fs.writeFileSync(path.join(DIST_DIR, 'index.js'), cjsEntryPoint);
  fs.writeFileSync(path.join(DIST_DIR, 'index.esm.js'), esmEntryPoint);
  fs.writeFileSync(path.join(DIST_DIR, 'index.d.ts'), dtsEntryPoint);
  console.log('Entry point files created successfully!');
} catch (err) {
  console.error('Error creating entry point files:', err);
  process.exit(1);
}

// Check the contents of the dist directory
console.log('Verifying dist directory contents:');
try {
  console.log(execSync(`ls -la ${DIST_DIR}`).toString());
} catch (err) {
  console.error('Error listing dist directory:', err);
}

console.log('Package is ready to be published.'); 