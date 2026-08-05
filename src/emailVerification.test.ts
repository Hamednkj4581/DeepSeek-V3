import assert from 'node:assert/strict';
import test from 'node:test';
import { Page } from 'puppeteer';

import { requestEmailVerificationCode } from './emailVerification.js';

function fakePage(states: Array<{ sent: boolean; error?: string }>): Pick<Page, 'click' | 'evaluate'> & { clicks: number } {
    return {
        clicks: 0,
        click: async function () { this.clicks++; },
        evaluate: async () => states.shift() ?? { sent: false }
    } as unknown as Pick<Page, 'click' | 'evaluate'> & { clicks: number };
}

test('waits for Proton to confirm that the verification email was sent', async () => {
    const page = fakePage([{ sent: false }, { sent: true }]);
    const requestedAt = await requestEmailVerificationCode(page, 'outlook@example.com', {
        pollsPerAttempt: 2,
        wait: async () => undefined
    });

    assert.ok(requestedAt instanceof Date);
    assert.equal(page.clicks, 1);
});

test('reports a visible Proton send error without leaking the Outlook address', async () => {
    const page = fakePage([{ sent: false, error: 'Too many requests for outlook@example.com' }]);

    await assert.rejects(
        requestEmailVerificationCode(page, 'outlook@example.com', { wait: async () => undefined }),
        error => error instanceof Error
            && error.message.includes('Too many requests for [EMAIL]')
            && !error.message.includes('outlook@example.com')
    );
    assert.equal(page.clicks, 1);
});

test('retries a click that produces no verification state transition', async () => {
    const page = fakePage([{ sent: false }, { sent: false }]);

    await assert.rejects(
        requestEmailVerificationCode(page, 'outlook@example.com', {
            attempts: 2,
            pollsPerAttempt: 1,
            wait: async () => undefined
        }),
        /点击发送按钮 2 次后/
    );
    assert.equal(page.clicks, 2);
});