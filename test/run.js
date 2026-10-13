'use strict';

const fs = require('fs');
const path = require('path');
const { run } = require('./harness');

for (const file of fs.readdirSync(__dirname).filter((name) => name.endsWith('.test.js')).sort()) {
    require(path.join(__dirname, file));
}

run().then((passed) => process.exit(passed ? 0 : 1));
