// Phase 2A full-chain contract (offline):
// saved Review readback -> publisher authority -> preview/publish/
// readback/restore -> Measure observation, one version identity.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createWordpressPublisher} from './publisher.mjs';
import {authorityFromSavedVersion} from './url-result-authority.mjs';
import {publicationFromEvidence} from '../phase2a-measure/from-publication.mjs';
import {observePublication, summarizeObservations} from '../phase2a-measure/observe.mjs';

const TARGET = 'https://test.example/the-clark/';
const versionRow = {
  id: '25b7a06c-d177-4efc-8474-83dafe2d5239', organization_id: 'org-a',
  first_result_payload: {
    snapshot: {content_fingerprint: 'sha256:' + 'a'.repeat(64)},
    preview: {fields: {
      title: {suggested: 'The Clark'},
      meta_description: {suggested: 'The Clark complete'},
      description: {suggested: 'The Clark. Maple complete.'},
    }},
  },
};
const reviewRow = {
  id: 'bb06b0d6-ca29-4b20-9e31-5f7839102f06',
  version_id: versionRow.id, decision: 'approved',
};

function fakeSite() {
  let posts = 0;
  const page = {
    id: 7, link: TARGET, title: {raw: 'Old'}, content: {raw: '<p>Old</p>'},
    meta: {growth_meta_description: 'Old meta'}, growth_revision: 'before',
    date_gmt: '2026-01-01T00:00:00', modified_gmt: '2026-01-01T00:00:00',
    slug: 'the-clark', status: 'publish', type: 'page', author: 2, parent: 0,
    menu_order: 0, comment_status: 'closed', ping_status: 'closed',
    template: '', featured_media: 0, date: '2026-01-01T00:00:00',
    excerpt: {raw: '', rendered: '<p>Old</p>\n', protected: false},
  };
  return {
    posts: () => posts,
    site: {
      target: 7, targetURL: TARGET, path: () => '/page',
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
          status: 200, json: () => structuredClone(page),
          text: `<title>${page.title.raw}</title><meta name="description" content="${page.meta.growth_meta_description}"><article data-page-id="7">${page.content.raw}</article>`,
        };
      },
    },
  };
}

test('saved review -> publish -> restore -> measure keeps one identity', async () => {
  const authority = authorityFromSavedVersion({versionRow, reviewRow, targetUrl: TARGET});
  const {site, posts} = fakeSite();
  const run = createWordpressPublisher({
    site, authorize: async token => {
      if (token !== 'owner') throw Error('denied');
      return structuredClone(authority);
    },
  }).dispatch;

  const intent = await run('owner', 'preview', {version_id: versionRow.id});
  const applied = await run('owner', 'publish', {intent_id: intent.id, page_id: 7, confirm: true});
  assert.equal(applied.state, 'confirmed_applied');

  const publication = publicationFromEvidence(applied);
  assert.equal(publication.version_id, versionRow.id);
  const observation = await observePublication(publication, {
    fetchPage: async () => ({status: 200, title: 'The Clark'}),
    clock: () => Date.parse('2026-10-21T00:00:00Z'),
  });
  assert.equal(observation.state, 'MEASURED');
  assert.equal(observation.version_id, versionRow.id);
  assert.equal(observation.public_url, TARGET);
  assert.equal(summarizeObservations([observation]).traffic, 'UNKNOWN');

  const restored = await run('owner', 'restore', {intent_id: intent.id, page_id: 7, confirm: true});
  assert.equal(restored.state, 'restored');
  assert.equal(posts(), 2);
});
