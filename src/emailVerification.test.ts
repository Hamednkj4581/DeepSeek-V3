import assert from 'node:assert/strict';
import test from 'node:test';
import { Page } from 'puppeteer';

import { fillEmailVerificationAddress, requestEmailVerificationCode } from './emailVerification.js';

function fakePage(
    states: Array<{ sent: boolean; error?: string }>,
    buttonStates: Array<'clicked' | 'disabled' | 'missing'> = []
): Pick<Page, 'evaluate'> & { clicks: number } {
    return {
        clicks: 0,
        evaluate: async function (callback: Function) {
            if (callback.toString().includes('Get verification code')) {
                const result = buttonStates.shift() ?? 'clicked';
                if (result === 'clicked') this.clicks++;
                return result;
            }
            return states.shift() ?? { sent: false };
        }
    } as unknown as Pick<Page, 'evaluate'> & { clicks: number };
}

test('replaces an existing address before retrying email verification', async () => {
    let assignedAddress = '';
    const page = {
        evaluate: async (_callback: Function, email: string) => {
            assignedAddress = email;
            return true;
        }
    } as unknown as Pick<Page, 'evaluate'>;

    await fillEmailVerificationAddress(page, 'outlook@example.com');

    assert.equal(assignedAddress, 'outlook@example.com');
});

test('reports when the email verification input is unavailable', async () => {
    const page = {
        evaluate: async () => false
    } as unknown as Pick<Page, 'evaluate'>;

    await assert.rejects(
        fillEmailVerificationAddress(page, 'outlook@example.com'),
        /邮箱输入框未显示/
    );
});

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

test('ignores decorative text returned by a generic Proton error selector', async () => {
    const page = fakePage([{ sent: false, error: '@proton.me' }, { sent: true }]);

    await requestEmailVerificationCode(page, 'outlook@example.com', {
        pollsPerAttempt: 2,
        wait: async () => undefined
    });
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

test('reports when the visible verification button is disabled', async () => {
    const page = fakePage([], ['disabled']);

    await assert.rejects(
        requestEmailVerificationCode(page, 'outlook@example.com', { wait: async () => undefined }),
        /发送按钮当前不可用/
    );
    assert.equal(page.clicks, 0);
});

test('reports when no visible verification button is available', async () => {
    const page = fakePage([], ['missing']);

    await assert.rejects(
        requestEmailVerificationCode(page, 'outlook@example.com', { wait: async () => undefined }),
        /发送按钮未显示/
    );
    assert.equal(page.clicks, 0);
});
