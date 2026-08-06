import assert from 'node:assert/strict';
import test from 'node:test';
import { Page } from 'puppeteer';

import { openRecoveryEmailDialog, requestRecoveryEmailVerification, submitRecoveryEmail } from './recoveryEmail.js';

interface RecoveryEmailState {
    ready: boolean;
    action?: string;
    authenticationRequired?: boolean;
}

function fakePage(states: RecoveryEmailState[]): Pick<Page, 'evaluate'> {
    return {
        evaluate: async () => states.shift() ?? { ready: false }
    } as unknown as Pick<Page, 'evaluate'>;
}

test('opens the recovery email dialog from the current Recovery page', async () => {
    const actions = await openRecoveryEmailDialog(fakePage([
        { ready: false, action: 'Add an email address' },
        { ready: true }
    ]), { wait: async () => undefined });

    assert.deepEqual(actions, ['Add an email address']);
});

test('supports the legacy multi-step recovery entry', async () => {
    const actions = await openRecoveryEmailDialog(fakePage([
        { ready: false, action: 'Safeguard account now' },
        { ready: false, action: 'Show more (2)' },
        { ready: false, action: 'Add a recovery email address' },
        { ready: true }
    ]), { wait: async () => undefined });

    assert.deepEqual(actions, [
        'Safeguard account now',
        'Show more (2)',
        'Add a recovery email address'
    ]);
});

test('reports a clear error when no recovery email entry is available', async () => {
    await assert.rejects(
        openRecoveryEmailDialog(fakePage([]), { maxPolls: 2, wait: async () => undefined }),
        /未找到可用的邮箱恢复入口/
    );
});

test('reports an expired registration session instead of a missing recovery entry', async () => {
    await assert.rejects(
        openRecoveryEmailDialog(fakePage([
            { ready: false, authenticationRequired: true }
        ]), { wait: async () => undefined }),
        /注册会话已失效/
    );
});

test('submits the current Add and verify recovery form', async () => {
    const label = await submitRecoveryEmail({
        evaluate: async () => 'Add and verify'
    } as unknown as Pick<Page, 'evaluate'>, { wait: async () => undefined });

    assert.equal(label, 'Add and verify');
});

test('supports the legacy Add email address submit button', async () => {
    const label = await submitRecoveryEmail({
        evaluate: async () => 'Add email address'
    } as unknown as Pick<Page, 'evaluate'>, { wait: async () => undefined });

    assert.equal(label, 'Add email address');
});

test('waits for the recovery submit button to become enabled', async () => {
    const results = [undefined, 'Add and verify'];
    let waits = 0;
    const label = await submitRecoveryEmail({
        evaluate: async () => results.shift()
    } as unknown as Pick<Page, 'evaluate'>, {
        maxPolls: 2,
        wait: async () => { waits++; }
    });

    assert.equal(label, 'Add and verify');
    assert.equal(waits, 1);
});

test('confirms recovery verification with email after password authentication', async () => {
    const requestedAt = await requestRecoveryEmailVerification({
        evaluate: async () => true
    } as unknown as Pick<Page, 'evaluate'>, { wait: async () => undefined });

    assert.ok(requestedAt instanceof Date);
});

test('waits for the recovery email verification confirmation to appear', async () => {
    const results = [false, true];
    let waits = 0;
    await requestRecoveryEmailVerification({
        evaluate: async () => results.shift()
    } as unknown as Pick<Page, 'evaluate'>, {
        maxPolls: 2,
        wait: async () => { waits++; }
    });

    assert.equal(waits, 1);
});

test('reports when recovery email verification cannot be confirmed', async () => {
    await assert.rejects(
        requestRecoveryEmailVerification({
            evaluate: async () => false
        } as unknown as Pick<Page, 'evaluate'>, { maxPolls: 1, wait: async () => undefined }),
        /未找到可用的 Verify with email 按钮/
    );
});
