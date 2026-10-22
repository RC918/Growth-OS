import test from 'node:test';
import assert from 'node:assert/strict';
import {observePublication, summarizeObservations} from './observe.mjs';

const pub = {
  version_id: '25b7a06c-d177-4efc-8474-83dafe2d5239',
  public_url: 'https://test.example/the-clark/',
  expected_title: 'The Clark',
};
const clock = () => Date.parse('2026-10-20T00:00:00Z');

test('reachable published page is MEASURED with timestamp and title match', async () => {
  const o = await observePublication(pub, {
    fetchPage: async url => ({status: 200, title: 'The Clark', url}),
    clock,
  });
  assert.equal(o.state, 'MEASURED');
  assert.equal(o.title_match, true);
  assert.equal(o.observed_at, '2026-10-20T00:00:00.000Z');
  assert.equal(o.version_id, pub.version_id);
});

test('missing page is NO_DATA, unreachable is NOT_CONNECTED, odd status UNKNOWN', async () => {
  const missing = await observePublication(pub, {
    fetchPage: async () => ({status: 404, title: ''}), clock});
  assert.equal(missing.state, 'NO_DATA');
  const down = await observePublication(pub, {
    fetchPage: async () => { throw Error('ECONNREFUSED'); }, clock});
  assert.equal(down.state, 'NOT_CONNECTED');
  const odd = await observePublication(pub, {
    fetchPage: async () => ({status: 503, title: 'The Clark'}), clock});
  assert.equal(odd.state, 'UNKNOWN');
});

test('summary keeps latest per version and never claims traffic', async () => {
  const first = await observePublication(pub, {
    fetchPage: async () => ({status: 404, title: ''}), clock});
  const second = await observePublication(pub, {
    fetchPage: async () => ({status: 200, title: 'The Clark'}),
    clock: () => Date.parse('2026-10-21T00:00:00Z')});
  const view = summarizeObservations([first, second]);
  assert.equal(view.publications.length, 1);
  assert.equal(view.publications[0].state, 'MEASURED');
  assert.equal(view.traffic, 'UNKNOWN');
});
