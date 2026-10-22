import test from 'node:test';
import assert from 'node:assert/strict';
import {publicationFromEvidence} from './from-publication.mjs';
import {observePublication, summarizeObservations} from './observe.mjs';

const intent = {
  id: 'op-1', version: 'v1', state: 'confirmed_applied',
  evidence: {
    binding: {organization_id: 'org-a', version_id: 'v1', review_id: 'r1'},
    target_url: 'https://test.example/the-clark/',
    html_fields: {title: 'The Clark', meta_description: 'Meta', description: 'Body'},
    api_fields: {title: 'The Clark', meta_description: 'Meta', description: 'Body'},
    modified_at: '2026-10-20T01:00:00Z', observed_at: '2026-10-20T01:00:05Z',
    traffic: 'unknown',
  },
};

test('publisher evidence becomes a measure-ready publication record', async () => {
  const publication = publicationFromEvidence(intent);
  assert.equal(publication.version_id, 'v1');
  assert.equal(publication.public_url, intent.evidence.target_url);
  const observation = await observePublication(publication, {
    fetchPage: async () => ({status: 200, title: 'The Clark'}),
    clock: () => Date.parse('2026-10-21T00:00:00Z'),
  });
  assert.equal(observation.state, 'MEASURED');
  const view = summarizeObservations([observation]);
  assert.equal(view.traffic, 'UNKNOWN');
});

test('unverified or mismatched evidence is refused', () => {
  assert.throws(() => publicationFromEvidence({...intent, state: 'preview'}));
  assert.throws(() => publicationFromEvidence({
    ...intent,
    evidence: {...intent.evidence, binding: {...intent.evidence.binding, version_id: 'v2'}},
  }));
});
