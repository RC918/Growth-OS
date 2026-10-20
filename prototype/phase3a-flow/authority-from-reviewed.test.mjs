import test from 'node:test';
import assert from 'node:assert/strict';
import {authorityFromReviewedAi} from './authority-from-reviewed.mjs';

const binding = {organization_id: 'org-a', version_id: 'v1', review_id: 'r1'};
const reviewed = {
  status: 'REVIEWED', unknown_fields: [], total_cost: 0.002,
  fields: {
    title: {final: 'The Clark 完整滑板', final_source: 'user_edit', citations: ['s1']},
    meta_description: {final: 'Maple complete skateboard', final_source: 'ai_suggestion', citations: ['s2']},
    description: {final: 'The Clark. Maple complete.', final_source: 'ai_suggestion', citations: ['s3']},
  },
};

test('reviewed AI fields with saved binding form publisher authority', () => {
  const a = authorityFromReviewedAi({reviewed, binding, targetUrl: 'https://test.example/the-clark/'});
  assert.equal(a.review_status, 'exact_version_confirmed');
  assert.deepEqual(a.binding, binding);
  assert.equal(a.fields.title.after, 'The Clark 完整滑板');
  assert.equal(a.field_sources.title, 'user_edit');
  assert.equal(a.field_sources.description, 'ai_suggestion');
});

test('unreviewed AI or incomplete binding can never form authority', () => {
  assert.throws(() => authorityFromReviewedAi({
    reviewed: {...reviewed, status: 'AWAITING_REVIEW'}, binding,
    targetUrl: 'https://test.example/'}));
  assert.throws(() => authorityFromReviewedAi({
    reviewed, binding: {organization_id: 'org-a'}, targetUrl: 'https://test.example/'}));
});
