import assert from 'node:assert/strict';
import { autoSendEligible } from '../lib/reply-policy.mjs';

const now = new Date('2026-10-21T12:00:00.000Z');
const draft = { created_at: '2026-10-19T12:00:00.000Z', tag: 'nostalgia', reply: 'recuerdo de fútbol' };
const history = Array.from({ length: 22 }, (_, day) => ({ decision: 'approved', edited: false, at: new Date(now.getTime() - day * 864e5).toISOString() }));
assert.equal(autoSendEligible(draft, { now, enabled: false, approvalHistory: history }), false);
assert.equal(autoSendEligible(draft, { now, enabled: true, approvalHistory: history.slice(0, 20) }), false);
assert.equal(autoSendEligible(draft, { now, enabled: true, approvalHistory: history }), true);
assert.equal(autoSendEligible({ ...draft, newsAdjacent: true }, { now, enabled: true, approvalHistory: history }), false);
console.log('PASS automatic lane is off by default and needs 21 clean observed days');
