'use strict';

// Records which build this is, so a packaged app knows whether it may report to GlitchTip.
// Only the GitHub workflows set PAIRKILLER_RELEASE_CHANNEL; local builds always record development.
const fs = require('fs');
const path = require('path');
const { releaseChannel } = require('../src/monitoring');

const file = path.join(__dirname, '..', 'src', 'generated', 'build.json');
const channel = releaseChannel(process.env);
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, `${JSON.stringify({ channel })}\n`);
console.log(`Release channel: ${channel}`);
