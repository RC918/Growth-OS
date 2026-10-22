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
  byId['annotator'].fire('change');
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
  byId['annotator'].fire('change');
  const first = byId['cases'].children[0];
  first.area.value = '理由甲';
  first.radios.find(r => r.value === '正確').listeners.change.forEach(f => f());
  byId['exportCsv'].fire('click');
  assert.ok(byId['exportPreview'].innerHTML.includes('正確'), 'export preview must show the displayed decision');
  byId['exportConfirm'].fire('click');
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

test('h16/h18/h21/h25/h29: last selection wins across navigation, reload and export', () => {
  const storage = makeStorage();
  let byId = loadPage(storage);
  byId['annotator'].value = 'TEST';
  byId['annotator'].fire('change');
  const order = blind.entries.map(e => e.id);
  const goto = (id) => {
    let pos = Number(storage.store['growthos-review-position'] || 0);
    const target = order.indexOf(id);
    while (pos < target) { byId['nextBtn'].fire('click'); pos++; }
    while (pos > target) { byId['prevBtn'].fire('click'); pos--; }
  };
  const answer = (decision, reason) => {
    const card = byId['cases'].children[0];
    card.area.value = reason;
    card.radios.find(r => r.value === decision).listeners.change.forEach(f => f());
  };
  const finals = {h16: '正確', h18: '無法判定', h21: '無法判定', h25: '正確', h29: '錯誤'};
  const firsts = {h16: '錯誤', h18: '錯誤', h21: '正確', h25: '無法判定', h29: '正確'};
  for (const id of Object.keys(finals)) {
    goto(id); answer(firsts[id], '先選');
    goto('h01'); goto(id); answer(finals[id], '最後選擇 ' + id);
  }
  // Refresh: a fresh page over the same storage, then export via preview.
  byId = loadPage(storage);
  byId['exportCsv'].fire('click');
  const preview = byId['exportPreview'].innerHTML;
  byId['exportConfirm'].fire('click');
  const csv = Object.fromEntries(byId.__downloads.at(-1).split('\n').slice(1)
    .map(l => { const m = l.match(/"([^"]*)","([^"]*)","([^"]*)","([^"]*)"/); return m ? [m[1], {decision: m[3], reason: m[4]}] : [l, {}]; }));
  byId['exportJson'].fire('click');
  byId['exportConfirm'].fire('click');
  const json = Object.fromEntries(JSON.parse(byId.__downloads.at(-1)).rows.map(r => [r.case_id, r]));
  for (const [id, decision] of Object.entries(finals)) {
    assert.ok(preview.includes(decision), id + ': preview missing final decision');
    assert.equal(csv[id].decision, decision, id + ': CSV does not reflect last selection');
    assert.equal(csv[id].reason, '最後選擇 ' + id, id + ': reason misaligned');
    assert.equal(json[id].decision, decision, id + ': JSON does not reflect last selection');
  }
});

test('typing a new code without committing cannot silently switch the export bucket', () => {
  const storage = makeStorage();
  const byId = loadPage(storage);
  byId['annotator'].value = 'TEST';
  byId['annotator'].fire('change');
  const card = byId['cases'].children[0];
  card.area.value = '畫面上的答案';
  card.radios.find(r => r.value === '正確').listeners.change.forEach(f => f());
  // Typing in the code field (no blur/commit) must not re-read another bucket.
  byId['annotator'].value = 'OTHER';
  byId['annotator'].fire('input');
  byId['exportCsv'].fire('click');
  byId['exportConfirm'].fire('click');
  const first = byId.__downloads.at(-1).split('\n')[1];
  assert.ok(first.includes('"TEST"') && first.includes('"正確"') && first.includes('"畫面上的答案"'),
    'export must match the displayed answers until the code is committed: ' + first);
  // Committing the code visibly switches to that code's own empty bucket.
  byId['annotator'].fire('change');
  assert.ok(byId['progress'].textContent.includes('0 / 30'));
});

test('editing after the preview invalidates it, and preview text is HTML-escaped', () => {
  const storage = makeStorage();
  const byId = loadPage(storage);
  byId['annotator'].value = 'TEST';
  byId['annotator'].fire('change');
  const card = byId['cases'].children[0];
  card.area.value = '理由含 <b>標籤</b>';
  card.radios.find(r => r.value === '正確').listeners.change.forEach(f => f());
  byId['exportCsv'].fire('click');
  const preview = byId['exportPreview'].innerHTML;
  assert.ok(preview.includes('&lt;b&gt;'), 'preview must escape annotator text');
  assert.ok(!preview.includes('<b>標籤</b>'), 'preview must not inject raw HTML');
  // Changing an answer after the preview must clear the stale preview,
  // so the confirm button can never download unseen content.
  card.radios.find(r => r.value === '錯誤').listeners.change.forEach(f => f());
  assert.equal(byId['exportPreview'].innerHTML, '');
});

test('review page offers the three plain-language decisions and per-annotator export', () => {
  for (const option of ['正確', '錯誤', '無法判定']) assert.ok(html.includes(option));
  assert.ok(html.includes('exportCsv'));
  assert.ok(html.includes('case_id,annotator_code,decision,reason'));
  assert.ok(html.includes('exportAdj'), 'adjudication export missing');
  assert.ok(!html.includes('api.github.com') && !html.includes('github.com/login'),
    'page must not require GitHub');
});
