// Only the disposable CI checkout is configured for the local fixture service.
const fs = require('node:fs');
const path = require('node:path');
const file = path.resolve(__dirname, '../../mobile/app.json');
const config = JSON.parse(fs.readFileSync(file, 'utf8'));
config.expo.extra.apiBaseUrl = 'http://localhost:8020';
config.expo.updates.enabled = false;
config.expo.ios.infoPlist.NSAppTransportSecurity = { NSAllowsLocalNetworking: true };
fs.writeFileSync(file, JSON.stringify(config, null, 2) + '\n');
