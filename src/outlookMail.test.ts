import assert from 'node:assert/strict';
import test from 'node:test';
import { extractProtonVerificationCode, verificationSearchStart } from './outlookMail.js';

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

test('allows Outlook message dates to be slightly earlier than the send request', () => {
    const requestStartedAt = new Date('2026-08-05T11:03:56.847Z');
    assert.equal(verificationSearchStart(requestStartedAt).toISOString(), '2026-08-05T11:03:26.847Z');
    assert.ok(new Date('2026-08-05T11:03:56.000Z') >= verificationSearchStart(requestStartedAt));
    assert.ok(new Date('2026-08-05T11:03:00.000Z') < verificationSearchStart(requestStartedAt));
});