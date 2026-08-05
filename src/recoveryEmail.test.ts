import assert from 'node:assert/strict';
import test from 'node:test';
import { Page } from 'puppeteer';

import { openRecoveryEmailDialog } from './recoveryEmail.js';

function fakePage(states: Array<{ ready: boolean; action?: string }>): Pick<Page, 'evaluate'> {
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
