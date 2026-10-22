import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const html = await readFile(new URL('./annotation/review.html', import.meta.url), 'utf8');
const blind = JSON.parse(await readFile(new URL('./fixtures/claim-holdout-blind-v1.json', import.meta.url)));

test('review page embeds exactly the 30 blind cases and no labels', () => {
  for (const entry of blind.entries) {
    assert.ok(html.includes(entry.id), 'missing case ' + entry.id);
    assert.ok(html.includes(entry.text), 'missing text for ' + entry.id);
  }
  for (const forbidden of ['expected_decision', 'label_rationale', 'engineering-prelabelled',
    'used_fact_ids', 'supported_rewrite', 'unsupported_or_contradictory',
    'PASS_WITH_REVIEW', 'FAIL_CLOSED', 'prototype decision', 'claim-verifier']) {
    assert.ok(!html.includes(forbidden), 'page leaks: ' + forbidden);
  }
});

class FakeEl {
  constructor(tag = 'div') {
    this.tagName = tag; this.children = []; this.value = ''; this.files = [];
    this.listeners = {}; this.textContent = ''; this.disabled = false; this._html = '';
    this.radios = []; this.area = null;
  }
  set innerHTML(v) {
    this._html = v; this.children = [];
    this.radios = [...v.matchAll(/<input type="radio"[^>]*value="([^"]*)"([^>]*)>/g)]
      .map(m => ({value: m[1], checked: m[2].includes('checked'),
        listeners: {}, addEventListener(n, f) { (this.listeners[n] ??= []).push(f); }}));
    if (v.includes('<textarea')) {
      this.area = new FakeEl('textarea');
    }
  }
  get innerHTML() { return this._html; }
  querySelector(sel) {
    if (sel === 'textarea') return this.area ??= new FakeEl('textarea');
    return new FakeEl('div');
  }
  querySelectorAll(sel) { return sel.includes('radio') ? this.radios : []; }
  appendChild(c) { this.children.push(c); return c; }
  addEventListener(n, f) { (this.listeners[n] ??= []).push(f); }
  fire(n, event = {}) { (this.listeners[n] || []).forEach(f => f(event)); }
  click() { this.fire('click'); }
}

function loadPage(localStorageStub) {
  const byId = {};
  const document = {
    getElementById(id) { return byId[id] ??= new FakeEl('div'); },
    createElement(tag) { return new FakeEl(tag); },
  };
  const js = html.match(/<script>([\s\S]*)<\/script>/)[1];
  const downloads = [];
  vm.runInNewContext(js, {document, localStorage: localStorageStub,
    Blob: class { constructor(parts) { this.parts = parts; } },
    URL: {createObjectURL: (blob) => { downloads.push(blob.parts.join('')); return 'blob:x'; },
      revokeObjectURL() {}}, alert() {}});
  byId.__downloads = downloads;
  return byId;
}

function makeStorage() {
  const store = {};
  return {store, getItem(k) { return k in store ? store[k] : null; },
    setItem(k, v) { store[k] = String(v); }};
}

test('progress survives a reload for the same code and stays isolated per code', () => {
  const storage = makeStorage();
  let byId = loadPage(storage);
  byId['annotator'].value = 'TEST';
  byId['annotator'].fire('input');
  // Answer the first two cases through the page's own handlers.
  const casesEl = byId['cases'];
  const first = casesEl.children[0];
  first.area.value = '證據支持';
  first.radios.find(r => r.value === '正確').listeners.change.forEach(f => f());
  const second = casesEl.children[1];
  second.area.value = '與證據不符';
  second.radios.find(r => r.value === '錯誤').listeners.change.forEach(f => f());
  assert.ok(byId['progress'].textContent.includes('2 / 30'));

  // Reload: a fresh page over the same storage restores code,
  // progress, answers and reasons.
  byId = loadPage(storage);
  assert.equal(byId['annotator'].value, 'TEST');
  assert.ok(byId['progress'].textContent.includes('2 / 30'));
  assert.equal(byId['cases'].children[0].area.value, '證據支持');
  assert.equal(byId['cases'].children[1].area.value, '與證據不符');

  // A different code sees an empty, isolated workspace.
  byId['annotator'].value = 'OTHER';
  byId['annotator'].fire('change');
  assert.ok(byId['progress'].textContent.includes('0 / 30'));
  // Switching back restores the first annotator's answers.
  byId['annotator'].value = 'TEST';
  byId['annotator'].fire('change');
  assert.ok(byId['progress'].textContent.includes('2 / 30'));
});

test('CSV export includes every case id with its decision and reason', () => {
  const storage = makeStorage();
  const byId = loadPage(storage);
  byId['annotator'].value = 'TEST';
  byId['annotator'].fire('input');
  const first = byId['cases'].children[0];
  first.area.value = '理由甲';
  first.radios.find(r => r.value === '正確').listeners.change.forEach(f => f());
  byId['exportCsv'].fire('click');
  const lines = byId.__downloads.at(-1).split('\n');
  assert.equal(lines[0], 'case_id,annotator_code,decision,reason');
  assert.equal(lines.length, 31);
  assert.ok(lines[1].includes('"h01"') && lines[1].includes('"TEST"')
    && lines[1].includes('"正確"') && lines[1].includes('"理由甲"'));
});

test('review page offers the three plain-language decisions and per-annotator export', () => {
  for (const option of ['正確', '錯誤', '無法判定']) assert.ok(html.includes(option));
  assert.ok(html.includes('exportCsv'));
  assert.ok(html.includes('case_id,annotator_code,decision,reason'));
  assert.ok(html.includes('exportAdj'), 'adjudication export missing');
  assert.ok(!html.includes('api.github.com') && !html.includes('github.com/login'),
    'page must not require GitHub');
});
