import assert from 'node:assert/strict';
import test from 'node:test';
import { Page } from 'puppeteer';

import { handlePostSignupPrompts } from './postSignup.js';

interface FakePostSignupState {
    action?: string;
    complete?: boolean;
    error?: string;
    location?: string;
}

function fakePage(results: Array<FakePostSignupState | Error>): Pick<Page, 'evaluate'> {
    return {
        evaluate: async () => {
            const result = results.shift() ?? {};
            if (result instanceof Error)
                throw result;
            return result;
        }
    } as unknown as Pick<Page, 'evaluate'>;
}

test('waits for an explicit authenticated page instead of treating an idle signup page as complete', async () => {
    let waits = 0;
    const actions = await handlePostSignupPrompts(fakePage([
        { location: 'https://account.proton.me/mail/signup' },
        { location: 'https://account.proton.me/mail/signup' },
        { complete: true, location: 'https://mail.proton.me/u/0/inbox' }
    ]), {
        maxPolls: 3,
        wait: async () => { waits++; }
    });

    assert.deepEqual(actions, []);
    assert.equal(waits, 2);
});

test('handles prompts from different Proton signup versions until the account route is ready', async () => {
    const actions = await handlePostSignupPrompts(fakePage([
        new Error('page navigated'),
        { action: 'Continue' },
        { action: "Let's get started" },
        { complete: true, location: 'https://mail.proton.me/u/0/inbox' }
    ]), {
        maxPolls: 5,
        wait: async () => undefined
    });

    assert.deepEqual(actions, ['Continue', "Let's get started"]);
});

test('allows Proton account creation to remain idle for longer than the old 60 second limit', async () => {
    const states: FakePostSignupState[] = Array.from({ length: 61 }, () => ({
        location: 'https://account.proton.me/mail/signup'
    }));
    states.push({ action: 'understood recovery necessity' });
    states.push({ action: 'Continue' });
    states.push({ complete: true, location: 'https://mail.proton.me/u/0/inbox' });

    const actions = await handlePostSignupPrompts(fakePage(states), {
        maxPolls: 64,
        wait: async () => undefined
    });

    assert.deepEqual(actions, ['understood recovery necessity', 'Continue']);
});

test('reports a visible Proton error during account creation', async () => {
    await assert.rejects(
        handlePostSignupPrompts(fakePage([
            { error: 'Unable to create your account. Please try again.' }
        ]), { wait: async () => undefined }),
        /Proton 注册完成阶段失败：Unable to create your account/
    );
});

test('reports a timeout without including URL query parameters', async () => {
    await assert.rejects(
        handlePostSignupPrompts(fakePage([
            { location: 'https://account.proton.me/mail/signup?token=sensitive' }
        ]), { maxPolls: 1, wait: async () => undefined }),
        error => {
            assert.match(String(error), /当前页面：https:\/\/account\.proton\.me\/mail\/signup/);
            assert.doesNotMatch(String(error), /sensitive/);
            return true;
        }
    );
});