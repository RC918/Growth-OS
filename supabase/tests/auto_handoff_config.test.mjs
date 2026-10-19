import assert from 'node:assert/strict';
import test from 'node:test';
import {resolveAutoHandoffConfig} from './auto_handoff_config.mjs';

test('defaults are byte-identical to the original hosted targets', () => {
  const c = resolveAutoHandoffConfig({});
  assert.equal(c.REF, 'vhzryhibmpvglzcmfnaa');
  assert.equal(c.ORIGIN, 'https://growth-os-preview-git-takeover-muse-primary-20261016-morning-ai.vercel.app');
  assert.equal(c.base, 'https://vhzryhibmpvglzcmfnaa.supabase.co');
  assert.equal(c.PRODUCT_URL, 'https://woo.novamodule.com/product/happy-ninja/');
});

test('env overrides retarget without touching unrelated defaults', () => {
  const c = resolveAutoHandoffConfig({HANDOFF_SUPABASE_REF: 'isolatedref', HANDOFF_ORIGIN: 'http://127.0.0.1:4319'});
  assert.equal(c.base, 'https://isolatedref.supabase.co');
  assert.equal(c.ORIGIN, 'http://127.0.0.1:4319');
  assert.equal(c.PRODUCT_URL, 'https://woo.novamodule.com/product/happy-ninja/');
});

test('explicit supabase URL wins over the ref-derived base', () => {
  const c = resolveAutoHandoffConfig({HANDOFF_SUPABASE_URL: 'http://127.0.0.1:54321', HANDOFF_SUPABASE_REF: 'isolatedref'});
  assert.equal(c.base, 'http://127.0.0.1:54321');
  assert.equal(c.REF, 'isolatedref');
});
