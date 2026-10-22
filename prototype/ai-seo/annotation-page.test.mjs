import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const html = await readFile(new URL('./annotation/review.html', import.meta.url), 'utf8');
const blind = JSON.parse(await readFile(new URL('./fixtures/claim-holdout-blind-v2.json', import.meta.url)));
const blindV1 = JSON.parse(await readFile(new URL('./fixtures/claim-holdout-blind-v1.json', import.meta.url)));
const translationsJson = await readFile(new URL('./fixtures/claim-holdout-translations-v2.json', import.meta.url), 'utf8');
const phaseCases = JSON.parse(await readFile(new URL('./fixtures/phase3b-cases.json', import.meta.url)));

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
  // One case at a time: answer the first, navigate, answer the second.
  const casesEl = byId['cases'];
  assert.equal(casesEl.children.length, 1, 'page must show one case at a time');
  const first = casesEl.children[0];
  first.area.value = '證據支持';
  first.radios.find(r => r.value === '正確').listeners.change.forEach(f => f());
  byId['nextBtn'].fire('click');
  const second = byId['cases'].children[0];
  second.area.value = '與證據不符';
  second.radios.find(r => r.value === '錯誤').listeners.change.forEach(f => f());
  assert.ok(byId['progress'].textContent.includes('2 / 30'));

  // Reload: a fresh page over the same storage restores code,
  // progress, answers and reasons.
  byId = loadPage(storage);
  assert.equal(byId['annotator'].value, 'TEST');
  assert.ok(byId['progress'].textContent.includes('2 / 30'));
  assert.equal(byId['cases'].children[0].area.value, '與證據不符');
  byId['prevBtn'].fire('click');
  assert.equal(byId['cases'].children[0].area.value, '證據支持');

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

test('every case shows a Traditional Chinese translation aid without changing English or ids', () => {
  const translations = JSON.parse(translationsJson);
  assert.equal(translations.human_annotation, false);
  for (const entry of blind.entries) {
    const tr = translations.translations[entry.id];
    assert.ok(tr, entry.id + ': missing translation');
    assert.ok(html.includes(tr.text_zh), entry.id + ': claim translation not rendered');
    for (const zh of tr.evidence_zh) assert.ok(html.includes(zh), entry.id + ': evidence translation not rendered');
    // Numbers and units must survive translation unchanged.
    for (const token of entry.text.match(/\d+(?:\.\d+)?/g) ?? []) {
      assert.ok(tr.text_zh.includes(token), entry.id + ': number changed in translation: ' + token);
    }
  }
  assert.ok(html.includes('英文原文（參考）'), 'English original must stay available collapsed');
  assert.ok(html.includes('比較的是'), 'semantic-comparison guidance missing');
  assert.ok(html.includes('不得視為正確'), 'unsupported-claim guidance missing');
});

test('v2 evidence is completed verbatim from trusted sources and v1 is preserved', () => {
  const quotes = new Set();
  for (const c of phaseCases.cases) {
    for (const cit of c.snapshot?.citations ?? []) quotes.add(cit.quote);
    for (const f of Object.values(c.report?.facts ?? {})) if (f.value) quotes.add(f.value);
    for (const cf of c.report?.conflicts ?? []) cf.values.forEach(v => quotes.add(v));
  }
  assert.equal(blind.version, 'phase3b2-claim-holdout-blind-v2');
  assert.equal(blindV1.version, 'phase3b2-claim-holdout-blind-v1');
  for (const entry of blind.entries) {
    const v1 = blindV1.entries.find(e => e.id === entry.id);
    assert.equal(entry.text, v1.text, entry.id + ': claim text changed');
    for (const ev of entry.evidence) {
      assert.ok([...quotes].some(q => q.includes(ev.quote_excerpt)),
        entry.id + ': excerpt not verbatim in trusted sources: ' + ev.quote_excerpt);
    }
  }
  // h01 v1 excerpt lacked the long/stable-platform support; v2 shows it.
  const h01v2 = blind.entries.find(e => e.id === 'h01');
  assert.ok(h01v2.evidence.some(ev => ev.quote_excerpt.includes('long, stable platform')));
});

test('review page offers the three plain-language decisions and per-annotator export', () => {
  for (const option of ['正確', '錯誤', '無法判定']) assert.ok(html.includes(option));
  assert.ok(html.includes('exportCsv'));
  assert.ok(html.includes('case_id,annotator_code,decision,reason'));
  assert.ok(html.includes('exportAdj'), 'adjudication export missing');
  assert.ok(!html.includes('api.github.com') && !html.includes('github.com/login'),
    'page must not require GitHub');
});
