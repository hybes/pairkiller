'use strict';

// Minimal runner so the suite works the same under `bun` and `node` with no test framework.
const tests = [];

function test(name, fn) {
    tests.push({ name, fn });
}

async function run() {
    let failed = 0;
    for (const { name, fn } of tests) {
        try {
            await fn();
            console.log(`ok    ${name}`);
        } catch (error) {
            failed += 1;
            console.error(`FAIL  ${name}\n${error && error.stack ? error.stack : error}\n`);
        }
    }
    console.log(`\n${tests.length - failed}/${tests.length} passed`);
    return failed === 0;
}

module.exports = { test, run };
