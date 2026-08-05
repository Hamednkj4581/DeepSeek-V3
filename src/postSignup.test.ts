import assert from 'node:assert/strict';
import test from 'node:test';
import { Page } from 'puppeteer';

import { handlePostSignupPrompts } from './postSignup.js';

function fakePage(results: Array<string | undefined | Error>): Pick<Page, 'evaluate'> {
    return {
        evaluate: async () => {
            const result = results.shift();
            if (result instanceof Error)
                throw result;
            return result;
        }
    } as unknown as Pick<Page, 'evaluate'>;
}

test('continues when no post-signup prompt exists', async () => {
    let waits = 0;
    const actions = await handlePostSignupPrompts(fakePage([undefined, undefined, undefined]), {
        maxPolls: 10,
        initialIdlePollsBeforeExit: 3,
        idlePollsBeforeExit: 3,
        wait: async () => { waits++; }
    });

    assert.deepEqual(actions, []);
    assert.equal(waits, 2);
});

test('handles prompts that appear in different versions without requiring all of them', async () => {
    const actions = await handlePostSignupPrompts(fakePage([
        new Error('page navigated'),
        'Continue',
        "Let's get started",
        undefined,
        undefined
    ]), {
        maxPolls: 10,
        idlePollsBeforeExit: 2,
        wait: async () => undefined
    });

    assert.deepEqual(actions, ['Continue', "Let's get started"]);
});

test('waits for the first post-signup prompt while Proton creates the account', async () => {
    let waits = 0;
    const actions = await handlePostSignupPrompts(fakePage([
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        'understood recovery necessity',
        'Continue',
        undefined,
        undefined
    ]), {
        maxPolls: 20,
        initialIdlePollsBeforeExit: 10,
        idlePollsBeforeExit: 2,
        wait: async () => { waits++; }
    });

    assert.deepEqual(actions, ['understood recovery necessity', 'Continue']);
    assert.equal(waits, 8);
});