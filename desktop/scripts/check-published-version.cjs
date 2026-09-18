const yaml = require('js-yaml');
const semver = require('semver');
const version = require('../package.json').version;
(async () => {
  const response = await fetch('https://github.com/cone387/ChewyBBTalk/releases/download/desktop-stable/latest.yml', { signal: AbortSignal.timeout(30_000) });
  if (response.status === 404) return; // First desktop release.
  if (!response.ok) throw Error(`Cannot verify published version: HTTP ${response.status}`);
  const previous = yaml.load(await response.text()).version;
  if (!semver.valid(previous) || !semver.gt(version, previous)) throw Error(`Refusing to replace desktop ${previous} with ${version}; bump the package version.`);
  console.log(`Desktop release may advance from ${previous} to ${version}`);
})().catch(error => { console.error(error); process.exitCode = 1; });
