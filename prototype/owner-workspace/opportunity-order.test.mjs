import assert from 'node:assert/strict';
import test from 'node:test';
import { orderOpportunities } from './opportunity-order.mjs';

test('workflow order promotes record repair, then approved drafts, then review, and archives rejected', () => {
  const items = [
    { id: 'candidate', status: 'candidate', created_at: '2026-09-28T00:00:00Z' },
    { id: 'approved', status: 'approved', created_at: '2026-09-28T00:00:00Z' },
    { id: 'rejected', status: 'rejected', created_at: '2026-09-28T00:00:00Z' },
    { id: 'missing', status: 'approved', created_at: '2026-09-27T00:00:00Z' },
  ];
  const sources = items.filter(x => x.id !== 'missing').map(x => ({ opportunity_id: x.id }));
  const decisions = [{ opportunity_id: 'approved', decision: 'approved' }, { opportunity_id: 'rejected', decision: 'rejected' }];
  const ordered = orderOpportunities(items, sources, decisions);
  assert.deepEqual(ordered.map(x => x.item.id), ['missing', 'approved', 'candidate', 'rejected']);
  assert.match(ordered[0].reason, /查核/);
  assert.match(ordered[1].reason, /草稿/);
  assert.equal(items[0].id, 'candidate');
});
