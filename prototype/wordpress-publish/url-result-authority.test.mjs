import test from 'node:test';
import assert from 'node:assert/strict';
import {authorityFromSavedVersion} from './url-result-authority.mjs';

const versionRow = {
  id: '25b7a06c-d177-4efc-8474-83dafe2d5239',
  organization_id: 'org-a',
  first_result_payload: {
    snapshot: {content_fingerprint: 'sha256:' + 'a'.repeat(64)},
    preview: {fields: {
      title: {suggested: 'The Clark'},
      meta_description: {suggested: 'Meta'},
      description: {suggested: 'Body'},
    }},
  },
};
const reviewRow = {
  id: 'bb06b0d6-ca29-4b20-9e31-5f7839102f06',
  version_id: versionRow.id, decision: 'approved',
};
const targetUrl = 'https://test.example/the-clark/';

test('approved saved version becomes exact publisher authority', () => {
  const a = authorityFromSavedVersion({versionRow, reviewRow, targetUrl});
  assert.equal(a.review_status, 'exact_version_confirmed');
  assert.deepEqual(a.binding, {
    organization_id: 'org-a', version_id: versionRow.id, review_id: reviewRow.id});
  assert.equal(a.fields.title.after, 'The Clark');
  assert.equal(a.target_url, targetUrl);
});

test('unapproved, mismatched or incomplete readback is refused', () => {
  assert.throws(() => authorityFromSavedVersion({
    versionRow, reviewRow: {...reviewRow, decision: 'pending'}, targetUrl}));
  assert.throws(() => authorityFromSavedVersion({
    versionRow, reviewRow: {...reviewRow, version_id: 'other'}, targetUrl}));
  assert.throws(() => authorityFromSavedVersion({
    versionRow: {...versionRow, first_result_payload: {preview: {fields: {}}}},
    reviewRow, targetUrl}));
});
