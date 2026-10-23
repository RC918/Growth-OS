// GOS-20261022-007: preserved initial failing requirement, now a regression.
// Uses the existing Console and real local HTTP/parser/SQLite fixture pipeline.
// No UI or provider response is mocked, and no claim mapping is inferred.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {chromium} from 'playwright';
import {adaptClaimEvidence} from '../../prototype/ai-seo/claim-evidence-adapter.mjs';
import {verifyClaims} from '../../prototype/ai-seo/claim-verifier.mjs';

const temp = await mkdtemp(join(tmpdir(), 'gos007-blocker-'));
const server = spawn('python3', ['-B', 'prototype/public-audit/product_ui_fixture.py', join(temp, 'sources.sqlite3')], {stdio: ['ignore', 'pipe', 'pipe']});
const observations = [];
let browser;
try {
  const port = await new Promise((resolve, reject) => {
    server.stdout.once('data', bytes => resolve(Number(bytes.toString().trim())));
    server.once('exit', code => reject(Error('fixture exit ' + code)));
  });
  const origin = 'http://127.0.0.1:' + port;
  browser = await chromium.launch({executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined});
  for (const width of [1280, 390]) {
    server.kill('SIGUSR1');
    const context = await browser.newContext({viewport: {width, height: 900}, serviceWorkers: 'block'});
    const page = await context.newPage(), errors = [], remote = [], posts = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {if (request.method() === 'POST') posts.push(new URL(request.url()).pathname);});
    await context.route('**/*', route => {
      if (new URL(route.request().url()).origin !== origin) {remote.push(route.request().url()); return route.abort();}
      return route.continue();
    });
    await page.goto(origin + '/growth-console.html');
    const response = page.waitForResponse(response => new URL(response.url()).pathname === '/api/product-source');
    await page.locator('#source-url').fill('https://example.com/products/bolt');
    await page.locator('#source-submit').click();
    const report = await (await response).json();
    await page.locator('#result-panel:not([hidden])').waitFor();
    const text = 'Bolt A is not made of steel.';
    // This explicit declaration is only a diagnostic input to the unchanged
    // adapter. It is NOT supplied by the Console producer and cannot be used
    // as the missing production used_fact_ids declaration.
    const fact = report.facts.description;
    const evidence = [{fact_id: 'description', quote_excerpt: fact.value, citation_ids: fact.citations}];
    const mapped = adaptClaimEvidence({report, text, evidence});
    assert.equal(mapped.status, 'READY');
    const oracle = verifyClaims(mapped.input);
    assert.equal(oracle.decision, 'FAIL_CLOSED');
    assert.ok(oracle.claims.some(claim => claim.status === 'CONTRADICTED'));
    await page.locator('#field-description').fill(text);
    await page.locator('#claim-field-description').filter({hasText: 'CONTRADICTED'}).waitFor();
    for (const key of ['title', 'meta_description', 'description']) await page.locator('#check-' + key).check();
    const disabledBefore = await page.locator('#review-confirm').isDisabled();
    if (!disabledBefore) {
      await page.locator('#review-confirm').click();
      await page.locator('#review-state').filter({hasText: '本頁已確認'}).waitFor();
    }
    observations.push({width, route: '/growth-console.html', data: 'isolated synthetic HTTP/parser/SQLite; no model', report,
      edit: text, explicit_diagnostic_evidence: evidence, unchanged_verifier: oracle,
      confirmation_disabled_before_click: disabledBefore,
      review_state: await page.locator('#review-state').innerText(),
      task_phase: await page.locator('#task-phase').innerText(),
      no_horizontal_overflow: await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      errors, remote, posts});
    await context.close();
  }
  console.log(JSON.stringify({status: observations.every(item => item.confirmation_disabled_before_click) ? 'PASS' : 'FAIL_REQUIRED_CLAIM_GATE_ABSENT', observations}, null, 2));
  if (process.env.GOS007_EVIDENCE_PATH) await writeFile(process.env.GOS007_EVIDENCE_PATH, JSON.stringify(observations, null, 2) + '\n');
  assert.ok(observations.every(item => item.confirmation_disabled_before_click), 'Contradicted text must block the existing Console confirmation in both viewports');
} finally {
  await browser?.close();
  const stopped = new Promise(resolve => server.once('exit', resolve));
  server.kill('SIGTERM');
  await stopped;
  await rm(temp, {recursive: true, force: true});
}
