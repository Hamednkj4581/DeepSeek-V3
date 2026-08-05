import assert from 'node:assert/strict';
import test from 'node:test';

import { VERIFICATION_TIMEOUT_MS } from './appConfig.js';

test('allows delayed Outlook delivery for Proton verification codes', () => {
    assert.equal(VERIFICATION_TIMEOUT_MS, 180_000);
});