// Phase 2B disposable real-WordPress acceptance (explicit mode only).
//
// Real pinned WordPress + MariaDB in run-owned containers (loopback,
// tmpfs, removed on exit). Drives the EXISTING publisher through a
// publication service whose authority comes from a saved Review
// readback shape (url-result-authority), with synthetic content only:
//   preview -> explicit authorization -> publish -> API/HTML readback
//   -> rollback -> readback, plus unapproved / tenant-changed /
//   duplicate / lost-response(unknown) safety checks, and a Measure
//   HTTP observation (traffic stays UNKNOWN). Nothing is public.
import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {createSite} from './site.mjs';
import {createPublicationService} from './service.mjs';
import {authorityFromSavedVersion} from './url-result-authority.mjs';
import {publicationFromEvidence} from '../phase2a-measure/from-publication.mjs';
import {observePublication} from '../phase2a-measure/observe.mjs';

if (process.argv.slice(2).join(' ') !== '--mode growth-os-isolated-regression') {
  throw Error('Explicit isolated regression mode required');
}

let site, service;
try {
  site = await createSite({sourceFixture: true, excerpt: ''});
  assert.equal(site.target, 1001);
  assert.equal(site.control, 1002);
  const dir = '/tmp/' + site.run + '-evidence';
  await mkdir(dir, {mode: 0o700});
  const initial = (await site.call(site.path(1001))).json();
  const controlBefore = site.controlSnapshot();

  // Synthetic reviewed content (own fixture text, no third-party copy).
  const versionRow = {
    id: 'phase2b-version-0001', organization_id: 'synthetic-org',
    first_result_payload: {
      snapshot: {content_fingerprint: 'sha256:' + 'b'.repeat(64)},
      preview: {fields: {
        title: {suggested: 'Phase 2B synthetic bolt'},
        meta_description: {suggested: 'Synthetic publish fixture'},
        description: {suggested: 'Synthetic body for disposable publish acceptance.'},
      }},
    },
  };
  const reviewRow = {id: 'phase2b-review-0001', version_id: versionRow.id, decision: 'approved'};
  let loseReply = true, posts = 0;
  const wrapped = {...site, call: async (path, options = {}) => {
    const result = await site.call(path, options);
    if (options.method === 'POST') {
      posts++;
      if (loseReply) { loseReply = false; await service.stop(); throw Error('Synthetic lost response after WordPress commit'); }
    }
    return result;
  }};
  const authorize = async (token, version) => {
    if (token !== 'fixture-owner') throw Error('denied');
    if (version === 'unapproved-version') {
      return {...authorityFromSavedVersion({versionRow, reviewRow: {...reviewRow, decision: 'pending'}, targetUrl: site.targetURL})};
    }
    return authorityFromSavedVersion({versionRow, reviewRow, targetUrl: site.targetURL});
  };
  service = await createPublicationService({
    path: dir + '/journal.json', auditPath: dir + '/events.jsonl',
    site: wrapped, organization_id: 'synthetic-org', authorize, authorizeRead: authorize,
  });
  const dispatch = (action, input, token = 'fixture-owner') => service.dispatch(token, action, input);

  // Unapproved version: zero writes.
  await assert.rejects(dispatch('preview', {version_id: 'unapproved-version'}));
  assert.equal(posts, 0);
  console.log('PASS unapproved version rejected before any write');

  // Cross-tenant token: zero writes.
  await assert.rejects(dispatch('preview', {version_id: versionRow.id}, 'foreign'));
  assert.equal(posts, 0);
  console.log('PASS foreign tenant token rejected before any write');

  const intent = await dispatch('preview', {version_id: versionRow.id});
  const input = {version_id: versionRow.id, intent_id: intent.id, page_id: 1001, confirm: true};

  // Lost response after WP commit -> unknown; duplicate publish and
  // new preview are refused; only GET reconciliation may proceed.
  await assert.rejects(dispatch('publish', input));
  assert.equal(posts, 1);
  const restart = await service.restart();
  assert.ok(restart.new_pid);
  assert.equal((await dispatch('history', {version_id: versionRow.id})).at(-1).state, 'unknown');
  await assert.rejects(dispatch('publish', input));
  await assert.rejects(dispatch('preview', {version_id: versionRow.id}));
  console.log('PASS lost response consumed as unknown; duplicate publish refused');

  const applied = await dispatch('readback', input);
  assert.equal(applied.state, 'confirmed_applied');
  assert.equal(posts, 1, 'reconciliation is GET-only');
  console.log('PASS publish API/HTML readback confirmed (version ' + versionRow.id + ')');

  // Measure: real HTTP readback of the public page; traffic UNKNOWN.
  const publication = publicationFromEvidence(applied);
  const observation = await observePublication(publication, {
    fetchPage: async url => {
      const r = await site.call(new URL(url).pathname, {authenticated: false});
      const title = /<title>([^<]*)<\/title>/.exec(r.text)?.[1] ?? '';
      return {status: r.status, title};
    },
    clock: () => Date.now(),
  });
  assert.equal(observation.state, 'MEASURED');
  assert.equal(observation.title_match, true);
  console.log('PASS measure HTTP observation MEASURED; traffic remains UNKNOWN');

  const restored = await dispatch('restore', input);
  assert.equal(restored.state, 'restored');
  assert.equal(posts, 2);
  const finalPage = (await site.call(site.path(1001))).json();
  assert.equal(finalPage.title.raw, initial.title.raw);
  assert.equal(finalPage.content.raw, initial.content.raw);
  assert.deepEqual(finalPage.meta, initial.meta);
  assert.deepEqual(site.controlSnapshot(), controlBefore);
  console.log('PASS rollback readback equals baseline; control page unchanged');

  const proof = {
    result: 'PASS', scope: 'disposable real WordPress; synthetic content; loopback only; not public',
    run: site.run, operation_id: intent.id, posts,
    publication: applied.evidence, observation,
    wordpress: site.version ?? null,
  };
  await writeFile(dir + '/phase2b-proof.json', JSON.stringify(proof, null, 2), {mode: 0o600});
  console.log('PHASE2B_WORDPRESS_ACCEPTANCE_PASS ' + dir);
} finally {
  await service?.close();
  await site?.close();
}
