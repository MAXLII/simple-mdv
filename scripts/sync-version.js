const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const configPath = path.join(root, 'neutralino.config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const checkOnly = process.argv.includes('--check');

if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(packageJson.version)) {
  throw new Error(`Invalid package version: ${packageJson.version}`);
}

if (config.version !== packageJson.version) {
  if (checkOnly) {
    throw new Error(`Version mismatch: package.json=${packageJson.version}, neutralino.config.json=${config.version}`);
  }
  config.version = packageJson.version;
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
}

console.log(`Version source is package.json (${packageJson.version})`);
