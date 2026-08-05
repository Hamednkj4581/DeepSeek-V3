import assert from 'node:assert/strict';
import test from 'node:test';
import { extractProtonVerificationCode } from './outlookMail.js';

test('extracts Proton verification code from visible HTML', () => {
    const html = '<p>Your Proton verification code is <strong>381729</strong>.</p><script>const code = 000000;</script>';
    assert.equal(extractProtonVerificationCode('Proton Verification Code', '', html), '381729');
});

test('extracts Proton verification code from plain text', () => {
    assert.equal(extractProtonVerificationCode('Verify your Proton email', 'Verification code: 492615', ''), '492615');
});

test('ignores unrelated and placeholder codes', () => {
    assert.equal(extractProtonVerificationCode('Other service', 'Code: 381729', ''), undefined);
    assert.equal(extractProtonVerificationCode('Proton Verification Code', 'Code: 000000', ''), undefined);
});