const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const yaml = require('js-yaml');
const manifest = yaml.load(fs.readFileSync('dist/latest.yml', 'utf8'));
const version = require('../package.json').version;
if (manifest.version !== version || !manifest.files?.length) throw Error('Invalid update manifest version/files');
for (const entry of manifest.files) {
  const filename = decodeURIComponent(entry.url);
  if (path.basename(filename) !== filename || !filename.endsWith('.exe')) throw Error('Unexpected installer path');
  const bytes = fs.readFileSync(path.join('dist', filename));
  if (bytes.length !== entry.size || crypto.createHash('sha512').update(bytes).digest('base64') !== entry.sha512) throw Error('Installer integrity mismatch');
  if (!fs.existsSync(path.join('dist', filename + '.blockmap'))) throw Error('Missing blockmap');
}
console.log(`Verified update manifest and installer integrity for ${version}`);
