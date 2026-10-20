// Frozen preflight behavior tests. Uses in-memory file maps only:
// missing mirror sync or stale manifest must FAIL, complete sync PASS.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {analyze} from './frozen-preflight.mjs';

const sha = s => createHash('sha256').update(s).digest('hex');
const FROZEN = 'apps/web/first-result-payload.mjs';
const MIRROR = 'prototype/owner-workspace/first-result-payload.mjs';
const MANIFEST = 'prototype/internal-rc/deploy/hashes.json';

function scenario({changed, frozenNow, mirrorNow, manifestNow}) {
  const base = {[FROZEN]: Buffer.from('v1'), [MIRROR]: Buffer.from('v1'),
    [MANIFEST]: Buffer.from(JSON.stringify({files: {[FROZEN]: sha('v1'), 'apps/web/other.mjs': sha('other')}}))};
  const now = {[FROZEN]: Buffer.from(frozenNow), [MIRROR]: Buffer.from(mirrorNow)};
  return analyze({
    changed,
    trackedFiles: [FROZEN, MIRROR, 'apps/web/other.mjs'],
    manifest: {[FROZEN]: manifestNow, 'apps/web/other.mjs': sha('other')},
    readCurrent: p => now[p] ?? (p === 'apps/web/other.mjs' ? Buffer.from('other') : null),
    readBase: p => base[p] ?? (p === 'apps/web/other.mjs' ? Buffer.from('other') : null),
  });
}

test('frozen change without mirror or manifest sync FAILs with required list', () => {
  const r = scenario({changed: [FROZEN], frozenNow: 'v2', mirrorNow: 'v1', manifestNow: sha('v1')});
  assert.equal(r.ok, false);
  assert.ok(r.requiredSync.includes(MIRROR));
  assert.ok(r.requiredSync.includes(MANIFEST));
});

test('complete sync PASSes', () => {
  const r = scenario({changed: [FROZEN, MIRROR, MANIFEST], frozenNow: 'v2', mirrorNow: 'v2', manifestNow: sha('v2')});
  assert.equal(r.ok, true, JSON.stringify(r.problems));
});

test('mirror changed alone FAILs', () => {
  const r = scenario({changed: [MIRROR], frozenNow: 'v1', mirrorNow: 'v2', manifestNow: sha('v1')});
  assert.equal(r.ok, false);
  assert.ok(r.requiredSync.includes(FROZEN));
});

test('generated dist copy is not treated as a reviewed mirror', () => {
  const DIST = 'delivery/growth-console/dist/first-result-payload.mjs';
  const base = {[FROZEN]: Buffer.from('v1'), [MIRROR]: Buffer.from('v1'), [DIST]: Buffer.from('v1'),
    [MANIFEST]: Buffer.from(JSON.stringify({files: {[FROZEN]: sha('v1')}}))};
  const now = {[FROZEN]: Buffer.from('v2'), [MIRROR]: Buffer.from('v2'), [DIST]: Buffer.from('v1')};
  const r = analyze({
    changed: [FROZEN, MIRROR, MANIFEST],
    trackedFiles: [FROZEN, MIRROR, DIST],
    manifest: {[FROZEN]: sha('v2')},
    readCurrent: p => now[p] ?? null,
    readBase: p => base[p] ?? null,
  });
  assert.equal(r.ok, true, JSON.stringify(r.problems));
});

test('unrelated change PASSes', () => {
  const r = scenario({changed: ['apps/web/other.mjs'], frozenNow: 'v1', mirrorNow: 'v1', manifestNow: sha('v1')});
  assert.equal(r.ok, true, JSON.stringify(r.problems));
});
