import assert from 'node:assert/strict';
import test from 'node:test';
import { formatProtonAccount } from './accountResult.js';

test('formats Proton account with the Outlook field separator', () => {
    assert.equal(
        formatProtonAccount('proton-user', 'password', 'otp-secret'),
        'proton-user----password----otp-secret'
    );
});