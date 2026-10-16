import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

// Offline guard for the W1 login dynamic-import failure class: every relative
// specifier reachable from the shipped entry must resolve to a hashed file in
// the closed deployment package. Runs without a browser, server, or network;
// it does not prove the live login works.
const dir = new URL('./dist/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('./SHA256.json', import.meta.url), 'utf8'));
const specifiers = (source) => [...source.matchAll(/(?:import[^'"]*from\s*|import\s*\(|export[^'"]*from\s*)['"](\.[^'"]+)['"]/g)].map((m) => m[1]);

// Hash equality for every dist file is already asserted by verify.mjs; this
// guard covers what it misses: the classic entry's dynamic import() graph.
test('module graph from w1-workspace-entry.js is closed', async () => {
  const seen = new Set();
  const queue = ['w1-workspace-entry.js'];
  while (queue.length) {
    const file = queue.pop();
    assert.ok(Object.hasOwn(manifest, file), `missing from package: ${file}`);
    if (seen.has(file)) continue;
    seen.add(file);
    const source = await readFile(new URL(file, dir), 'utf8');
    for (const spec of specifiers(source)) queue.push(spec.replace(/^\.\//, ''));
  }
  assert.ok(seen.has('product-fact.mjs'));
  assert.ok(seen.size >= 10, `graph unexpectedly small: ${seen.size}`);
});
