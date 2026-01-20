#!/usr/bin/env node
/**
 * Rebuild desktop/native-mac for Electron. Run from repo root or desktop:
 *   node desktop/scripts/rebuild-mac-addon.js
 *   npm run rebuild:mac  (from desktop)
 * Requires: node-gyp, Electron installed. macOS only.
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

if (process.platform !== 'darwin') {
  console.log('rebuild-mac-addon: skipping (not macOS)');
  process.exit(0);
}

const desktop = path.resolve(__dirname, '..');
const nativeMac = path.join(desktop, 'native-mac');

// Prefer desktop/node_modules/electron, then sibling to desktop
let electronPkg = path.join(desktop, 'node_modules', 'electron', 'package.json');
if (!fs.existsSync(electronPkg)) {
  electronPkg = path.join(desktop, '..', 'node_modules', 'electron', 'package.json');
}
let electronVersion = '32.0.1';
if (fs.existsSync(electronPkg)) {
  try {
    electronVersion = JSON.parse(fs.readFileSync(electronPkg, 'utf8')).version;
  } catch (_) {}
}

console.log('rebuild-mac-addon: target Electron', electronVersion);

execSync('npm install --ignore-scripts', { cwd: nativeMac, stdio: 'inherit' });

const args = [
  'configure', 'build', '--release',
  '--target=' + electronVersion,
  '--dist-url=https://electronjs.org/headers',
];
const nodeGypBin = path.join(desktop, 'node_modules', 'node-gyp', 'bin', 'node-gyp.js');
const nodeGypCmd = fs.existsSync(nodeGypBin) ? `node "${nodeGypBin}"` : 'npx node-gyp';
execSync(nodeGypCmd + ' ' + args.join(' '), { cwd: nativeMac, stdio: 'inherit' });

console.log('rebuild-mac-addon: done.');
