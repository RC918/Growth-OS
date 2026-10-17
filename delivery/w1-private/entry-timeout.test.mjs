import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

// Offline regression: a module request that never settles must surface the
// classified MODULE_LOAD failure (and keep sending disabled) instead of
// leaving the page on its initializing message forever. No browser/network.
test('hung dynamic import times out with MODULE_LOAD and disabled send', async () => {
  const source = await readFile(new URL('../../apps/web/w1-workspace-entry.js', import.meta.url), 'utf8');
  const elements = {
    'send-link': {disabled: false},
    'auth-status': {textContent: '登入介面初始化中'},
  };
  let timerFn = null;
  const context = vm.createContext({
    document: {getElementById: (id) => elements[id]},
    setTimeout: (fn) => { timerFn = fn; return 1; },
    clearTimeout: () => {},
    console,
  });
  await vm.runInContext(source, context, {
    importModuleDynamically: () => new Promise(() => {}), // request never settles
  });
  await new Promise((r) => setImmediate(r));
  assert.equal(typeof timerFn, 'function');
  timerFn(); // fire the 15s load bound without waiting
  assert.equal(elements['send-link'].disabled, true);
  assert.match(elements['auth-status'].textContent, /登入元件載入失敗/);
  assert.match(elements['auth-status'].textContent, /MODULE_LOAD/);
  assert.doesNotMatch(elements['auth-status'].textContent, /access_token|secret/);
});
