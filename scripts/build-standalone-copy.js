const fs = require('fs');
const path = require('path');

const standaloneRoot = path.join(process.cwd(), '.next', 'standalone');
const staticSource = path.join(process.cwd(), '.next', 'static');
const publicSource = path.join(process.cwd(), 'public');

function getStandaloneServerDir(root) {
  const rootServer = path.join(root, 'server.js');
  if (fs.existsSync(rootServer)) {
    return root;
  }

  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) {
      continue;
    }
    const candidate = path.join(root, entry.name);
    if (fs.existsSync(path.join(candidate, 'server.js'))) {
      return candidate;
    }
  }

  throw new Error(`Could not find standalone server.js under ${root}`);
}

if (!fs.existsSync(standaloneRoot)) {
  console.log('Standalone: no standalone build found, skipping asset copy');
  process.exit(0);
}

const serverDir = getStandaloneServerDir(standaloneRoot);
const publicTarget = path.join(serverDir, 'public');
const staticTarget = path.join(serverDir, '.next', 'static');
const pruneTargets = [
  path.join(serverDir, '.git'),
  path.join(serverDir, 'electron', 'out'),
];

for (const target of pruneTargets) {
  if (fs.existsSync(target)) {
    fs.rmSync(target, { recursive: true, force: true });
  }
}

if (fs.existsSync(publicSource)) {
  fs.mkdirSync(publicTarget, { recursive: true });
  fs.cpSync(publicSource, publicTarget, { recursive: true });
}

if (fs.existsSync(staticSource)) {
  fs.mkdirSync(staticTarget, { recursive: true });
  fs.cpSync(staticSource, staticTarget, { recursive: true });
}

console.log(`Standalone: copied public and static into ${serverDir}`);
