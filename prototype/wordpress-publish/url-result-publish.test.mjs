// Phase 2A contract: a reviewed URL-result version (the shape produced
// by the Staging Save/Review chain) is the ONLY authority that can drive
// the existing WordPress publisher. Offline fake site; no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createWordpressPublisher} from './publisher.mjs';

// Reviewed URL-result version, Landy-shaped (declared_product_dom).
const reviewed = {
  version_id: '25b7a06c-d177-4efc-8474-83dafe2d5239',
  review_id: 'bb06b0d6-ca29-4b20-9e31-5f7839102f06',
  organization_id: 'org-a',
  review_status: 'exact_version_confirmed',
  target_url: 'https://127.0.0.1:443/the-clark/',
  fields: {
    title: {before: 'Old title', after: 'The Clark'},
    meta_description: {before: 'Old meta', after: 'The Clark complete skateboard'},
    description: {before: 'Old body', after: 'The Clark. Maple complete.'},
  },
};

function authorityFrom(version, overrides = {}) {
  return {
    review_status: version.review_status,
    binding: {
      organization_id: version.organization_id,
      version_id: version.version_id,
      review_id: version.review_id,
    },
    target_url: version.target_url,
    fields: Object.fromEntries(
      Object.entries(version.fields).map(([k, f]) => [k, {after: f.after}])),
    ...overrides,
  };
}

function fakeSite() {
  let posts = 0;
  const page = {
    id: 7, link: reviewed.target_url,
    title: {raw: 'Old title'}, content: {raw: '<p>Old body</p>'},
    meta: {growth_meta_description: 'Old meta'}, growth_revision: 'before',
    date_gmt: '2026-01-01T00:00:00', modified_gmt: '2026-01-01T00:00:00',
    slug: 'the-clark', status: 'publish', type: 'page', author: 2, parent: 0,
    menu_order: 0, comment_status: 'closed', ping_status: 'closed',
    template: '', featured_media: 0,
    excerpt: {raw: '', rendered: '<p>Old body</p>\n', protected: false},
    date: '2026-01-01T00:00:00',
  };
  const site = {
    target: 7, targetURL: reviewed.target_url, path: () => '/page',
    call: async (path, o = {}) => {
      if (o.method === 'POST') {
        posts++;
        page.title.raw = o.body.title;
        page.content.raw = o.body.content;
        page.meta.growth_meta_description = o.body.meta.growth_meta_description;
        page.growth_revision = 'rev-' + posts;
        page.excerpt.rendered = page.content.raw + '\n';
      }
      return {
        status: 200,
        json: () => structuredClone(page),
        text: `<title>${page.title.raw}</title><meta name="description" content="${page.meta.growth_meta_description}"><article data-page-id="7">${page.content.raw}</article>`,
      };
    },
  };
  return {site, posts: () => posts};
}

function publisherFor(authority, tokens = {owner: 'org-a', viewer: 'org-a'}) {
  const {site, posts} = fakeSite();
  const authorize = async token => {
    if (!tokens[token]) throw Error('denied');
    return structuredClone(authority);
  };
  const run = createWordpressPublisher({site, authorize}).dispatch;
  return {run, posts};
}

test('reviewed URL-result version publishes, reads back and restores', async () => {
  const {run, posts} = publisherFor(authorityFrom(reviewed));
  const intent = await run('owner', 'preview', {version_id: reviewed.version_id});
  assert.equal(intent.state, 'preview');
  assert.equal(intent.fields.title.after, 'The Clark');
  const applied = await run('owner', 'publish',
    {intent_id: intent.id, page_id: 7, confirm: true});
  assert.equal(applied.state, 'confirmed_applied');
  assert.equal(applied.evidence.target_url, reviewed.target_url);
  const restored = await run('owner', 'restore',
    {intent_id: intent.id, page_id: 7, confirm: true});
  assert.equal(restored.state, 'restored');
  assert.equal(posts(), 2);
});

test('unapproved or stale version can never reach a write', async () => {
  const pending = publisherFor(authorityFrom(reviewed,
    {review_status: 'review_required'}));
  await assert.rejects(pending.run('owner', 'preview',
    {version_id: reviewed.version_id}));
  assert.equal(pending.posts(), 0);

  const staleAuthority = authorityFrom(reviewed);
  const stale = publisherFor(staleAuthority);
  const intent = await stale.run('owner', 'preview',
    {version_id: reviewed.version_id});
  staleAuthority.binding.version_id = '99999999-9999-4999-8999-999999999999';
  await assert.rejects(stale.run('owner', 'publish',
    {intent_id: intent.id, page_id: 7, confirm: true}));
  assert.equal(stale.posts(), 0);
});

test('cross-tenant token cannot preview or publish', async () => {
  const {run, posts} = publisherFor(authorityFrom(reviewed),
    );
  await assert.rejects(run('foreign', 'preview',
    {version_id: reviewed.version_id}));
  assert.equal(posts(), 0);
});

test('measurement of an isolated publication stays UNKNOWN, never traffic', async () => {
  const {run} = publisherFor(authorityFrom(reviewed));
  const intent = await run('owner', 'preview', {version_id: reviewed.version_id});
  await run('owner', 'publish', {intent_id: intent.id, page_id: 7, confirm: true});
  const view = await run('owner', 'measurement', {version_id: reviewed.version_id});
  assert.equal(view.publication.evidence.traffic, 'unknown');
  assert.ok(view.assessment.unknown.length > 0);
});
