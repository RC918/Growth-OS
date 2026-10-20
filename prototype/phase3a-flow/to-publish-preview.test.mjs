import test from 'node:test';
import assert from 'node:assert/strict';
import {publishFieldsFromReviewed} from './to-publish-preview.mjs';

const reviewed = {
  status: 'REVIEWED', total_cost: 0.002, unknown_fields: ['price'],
  fields: {
    title: {final: 'The Clark 完整滑板', final_source: 'user_edit', citations: ['s1']},
    meta_description: {final: 'Maple complete skateboard', final_source: 'ai_suggestion', citations: ['s2']},
    description: {final: 'The Clark. Maple complete.', final_source: 'ai_suggestion', citations: ['s3']},
  },
};

test('reviewed AI fields become publish-preview fields with provenance', () => {
  const out = publishFieldsFromReviewed(reviewed);
  assert.equal(out.fields.title.after, 'The Clark 完整滑板');
  assert.equal(out.fields.title.source, 'user_edit');
  assert.equal(out.fields.description.source, 'ai_suggestion');
  assert.deepEqual(out.unknown_fields, ['price']);
});

test('unreviewed or incomplete AI output can never reach preview', () => {
  assert.throws(() => publishFieldsFromReviewed({...reviewed, status: 'AWAITING_REVIEW'}));
  assert.throws(() => publishFieldsFromReviewed({
    ...reviewed, fields: {...reviewed.fields, title: {final_source: 'ai_suggestion'}}}));
  assert.throws(() => publishFieldsFromReviewed(null));
});
