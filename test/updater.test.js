'use strict';

const assert = require('assert');
const { test } = require('./harness');
const { isUpdateServerUnreachable } = require('../src/main/updater');

test('updater: an unreachable or failing update server is not a Pairkiller fault', () => {
    for (const error of [
        Object.assign(new Error('getaddrinfo ENOTFOUND github.com'), { code: 'ENOTFOUND' }),
        new Error('net::ERR_INTERNET_DISCONNECTED'),
        new Error('net::ERR_NAME_NOT_RESOLVED'),
        new Error('read ECONNRESET'),
        new Error('connect ETIMEDOUT 140.82.121.4:443'),
        new Error('socket hang up'),
        Object.assign(new Error('HttpError: 503 Service Unavailable'), { statusCode: 503 }),
        Object.assign(new Error('HttpError: 429 Too Many Requests'), { statusCode: 429 }),
    ]) {
        assert.strictEqual(isUpdateServerUnreachable(error), true, error.message);
    }
});

test('updater: signing, missing releases and our own errors still warn', () => {
    for (const error of [
        new Error('Could not get code signature for running application'),
        Object.assign(new Error('HttpError: 404 Not Found'), { statusCode: 404 }),
        new Error('Cannot find latest-mac.yml in the latest release artifacts'),
        new TypeError("Cannot read properties of undefined (reading 'version')"),
        null,
        'sha512 checksum mismatch',
    ]) {
        assert.strictEqual(isUpdateServerUnreachable(error), false, String(error && error.message || error));
    }
});
