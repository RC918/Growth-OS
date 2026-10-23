import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {chromium} from 'playwright';

const temp = await mkdtemp(join(tmpdir(), 'growth-console-claims-'));
const fixture = spawn('python3', ['-B', 'delivery/growth-console/claim-source-fixture.py', join(temp, 'sources.sqlite3')], {stdio: ['ignore', 'pipe', 'pipe']});
const evidence = [];
let browser, packaged;
try {
  const port = await new Promise((resolve, reject) => {
    fixture.stdout.once('data', data => resolve(Number(data.toString().trim())));
    fixture.once('exit', code => reject(Error('fixture exit ' + code)));
  });
  const origin = 'http://127.0.0.1:' + port;
  browser = await chromium.launch({executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined});
  for (const width of [1280, 390]) {
    const context = await browser.newContext({viewport: {width, height: 900}, serviceWorkers: 'block'});
    const page = await context.newPage(), errors = [], remote = [], posts = [], domCases = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {if (request.method() === 'POST') posts.push(new URL(request.url()).pathname);});
    await context.route('**/*', route => {
      if (new URL(route.request().url()).origin !== origin) {remote.push(route.request().url()); return route.abort();}
      return route.continue();
    });
    await page.goto(origin + '/growth-console.html');
    async function record(label) {
      domCases.push(await page.evaluate(label => ({label,
        source_input: document.getElementById('source-url').value,
        source_binding: document.getElementById('result-binding').textContent,
        status: document.getElementById('claim-status').textContent,
        review_state: document.getElementById('review-state').textContent,
        confirm_disabled: document.getElementById('review-confirm').disabled,
        fields: Object.fromEntries(['title', 'meta_description', 'description'].map(key => [key, {
          text: document.getElementById('field-' + key)?.value,
          claims: document.getElementById('claim-field-' + key)?.textContent,
        }])),
      }), label));
    }
    async function overview() {
      if (await page.locator('#source-url').isVisible()) return;
      if (width < 1024) await page.locator('#nav-toggle').click();
      await page.locator('[data-view=overview]').click();
    }
    async function load(kind, expected = 'checked') {
      fixture.kill('SIGUSR1'); await overview();
      await page.locator('#source-url').fill('https://example.com/' + kind);
      if (await page.locator('#result-fields .field').count()) assert.equal(await page.locator('#review-confirm').isDisabled(), true);
      const response = page.waitForResponse(response => new URL(response.url()).pathname === '/api/product-source');
      await page.locator('#source-submit').click();
      const report = await (await response).json();
      if (expected === 'invalid') {
        await page.locator('#source-feedback').filter({hasText: '來源與成果版本未通過核對'}).waitFor();
      } else {
        await page.locator('#result-panel:not([hidden])').waitFor();
        await page.waitForFunction(() => /REVIEW|檢查未通過|偵測宣稱檢查完成/.test(document.getElementById('claim-status').textContent));
      }
      return report;
    }
    async function allChecked() {for (const key of ['title', 'meta_description', 'description']) await page.locator('#check-' + key).check();}
    const normal = await load('normal');
    assert.match(await page.locator('#mode-banner').innerText(), /來源摘錄，不呼叫模型/);
    assert.match(await page.locator('#claim-status').innerText(), /REVIEW/);
    assert.match(await page.locator('#claim-field-title').innerText(), /REVIEW.*需人工讀核/);
    assert.equal(await page.locator('#claim-report').textContent(), JSON.stringify(normal, null, 2));
    await allChecked(); assert.equal(await page.locator('#review-confirm').isEnabled(), true);
    await record('normal features and visible human REVIEW');
    await page.locator('#review-confirm').evaluate(button => {button.click(); button.click();});
    await page.locator('#review-state').filter({hasText: '本頁已確認'}).waitFor();
    // Input invalidates the receipt and gate synchronously, before any queued check.
    assert.equal(await page.locator('#field-description').evaluate(input => {
      input.value = 'Not made of steel.'; input.dispatchEvent(new Event('input', {bubbles: true}));
      return document.getElementById('review-confirm').disabled;
    }), true);
    await page.locator('#claim-field-description').filter({hasText: 'CONTRADICTED'}).waitFor();
    assert.match(await page.locator('#review-state').innerText(), /^待確認/);
    await page.locator('#check-description').check();
    assert.equal(await page.locator('#review-confirm').isDisabled(), true);
    await record('contradiction blocks confirmation');
    // Invoke the real bound action after removing only the DOM disabled flag:
    // the task must retain veto power independently of visual presentation.
    await page.locator('#review-confirm').evaluate(button => {button.disabled = false; button.click(); button.click();});
    assert.match(await page.locator('#review-state').innerText(), /^待確認/);
    await record('forced DOM action still cannot acquire receipt');
    await page.locator('#later').click(); await page.locator('#return-result').click();
    assert.equal(await page.locator('#field-description').inputValue(), 'Not made of steel.');
    await page.locator('#field-description').fill('Waterproof.');
    await page.locator('#claim-field-description').filter({hasText: 'UNSUPPORTED'}).waitFor();
    assert.match(await page.locator('#claim-field-description').innerText(), /UNKNOWN／缺少已宣告的支持/);
    await record('UNKNOWN unsupported claim');
    await page.locator('#field-description').fill(normal.preview.fields.description.suggested);
    await page.locator('#claim-status').filter({hasText: 'REVIEW'}).waitFor();
    // Cancel a queued local check using the actual DOM controls, then let its
    // promise complete. No test module or response is substituted.
    const cancelled = await page.evaluate(() => {
      document.getElementById('claim-recheck').click();
      const wasVisible = !document.getElementById('claim-cancel').hidden;
      document.getElementById('claim-cancel').click();
      return wasVisible;
    });
    assert.equal(cancelled, true);
    await page.evaluate(() => Promise.resolve());
    assert.match(await page.locator('#claim-status').innerText(), /舊檢查已失效/);
    assert.equal(await page.locator('#review-confirm').isDisabled(), true);
    await record('cancelled check ignores late continuation');
    await page.locator('#claim-recheck').focus(); await page.keyboard.press('Enter');
    await page.locator('#claim-status').filter({hasText: 'REVIEW'}).waitFor();
    await allChecked(); await page.locator('#review-confirm').click();
    await page.locator('#review-state').filter({hasText: '本頁已確認'}).waitFor();
    // Two edits enqueue two checks; the old positive must not authorize the
    // newer contradictory input when its asynchronous continuation runs.
    await page.locator('#field-description').evaluate((input, original) => {
      for (const value of [original + ' ', 'Not made of steel.']) {
        input.value = value; input.dispatchEvent(new Event('input', {bubbles: true}));
      }
    }, normal.preview.fields.description.suggested);
    await page.locator('#claim-field-description').filter({hasText: 'CONTRADICTED'}).waitFor();
    assert.equal(await page.locator('#review-confirm').isDisabled(), true);
    await record('new contradictory edit ignores old positive check');
    const conflicting = [];
    for (const kind of ['opposite', 'hidden-opposite']) {
      const report = await load(kind);
      await allChecked(); assert.equal(await page.locator('#review-confirm').isDisabled(), true);
      assert.match(await page.locator('#claim-field-meta_description').innerText(), /SOURCE_CONFLICT/);
      const raw = await page.locator('#claim-report').textContent();
      assert.equal(raw, JSON.stringify(report, null, 2));
      assert.ok((await page.locator('#claim-context').textContent()).includes(report.facts.features[2].value));
      await record(kind);
      conflicting.push({kind, full_feature: report.facts.features[2], gate: await page.locator('#claim-status').innerText()});
    }
    await load('undeclared-positive');
    await page.locator('#field-meta_description').fill('Made of titanium.');
    await page.locator('#claim-field-meta_description').filter({hasText: 'UNSUPPORTED'}).waitFor();
    assert.equal(await page.locator('#review-confirm').isDisabled(), true);
    await record('undeclared other-field positive cannot support meta');
    const unmapped = await load('mapping');
    assert.match(await page.locator('#claim-field-title').innerText(), /UNKNOWN.*無法證明/);
    assert.equal(await page.locator('#review-confirm').isDisabled(), true);
    assert.equal(await page.locator('#claim-report').textContent(), JSON.stringify(unmapped, null, 2));
    await record('unproven producer mapping');
    await load('missing-citation', 'invalid');
    assert.equal(await page.locator('#review-confirm').isDisabled(), true);
    assert.match(await page.locator('#claim-status').innerText(), /舊檢查已失效/);
    await record('missing citation rejects source and invalidates old check');
    const prefixSource = await load('prefix-dotted-name');
    assert.equal(prefixSource.facts.product_name.value, 'İstanbul Bolt');
    assert.equal(await page.locator('#field-description').inputValue(), prefixSource.preview.fields.description.suggested);
    assert.match(await page.locator('#field-description').inputValue(), /^istanbul Bolt is made of steel\./);
    await allChecked(); assert.equal(await page.locator('#review-confirm').isEnabled(), true);
    await page.locator('#review-confirm').click();
    await page.locator('#review-state').filter({hasText: '本頁已確認'}).waitFor();
    await record('Python dotted-I source maps exactly and human confirmation remains usable');
    const prefixOpposite = await load('prefix-opposite');
    await allChecked(); assert.equal(await page.locator('#review-confirm').isDisabled(), true);
    assert.match(await page.locator('#claim-field-meta_description').innerText(), /SOURCE_CONFLICT/);
    assert.ok((await page.locator('#claim-context').textContent()).includes(prefixOpposite.facts.features[2].value));
    await record('Python dotted-I compatibility retains complete source conflict veto');
    const final = await load('normal');
    await allChecked(); await page.locator('#review-confirm').click();
    await page.locator('#review-state').filter({hasText: '本頁已確認'}).waitFor();
    await record('normal recovery confirmed');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.deepEqual(errors, []); assert.deepEqual(remote, []);
    assert.ok(posts.every(path => path === '/api/product-source'));
    assert.deepEqual(await page.evaluate(() => [localStorage.length, sessionStorage.length]), [0, 0]);
    evidence.push({width, entry: '/growth-console.html', synthetic: true, model_calls: 0, normal_source: final,
      source_context: await page.locator('#claim-context').textContent(), dom_cases: domCases, conflicting,
      prefix_sources: [prefixSource, prefixOpposite], errors, remote, posts,
      confirmed: await page.locator('#review-state').innerText(),
      matrix: ['normal indexed features', 'REVIEW visible', 'contradicted action veto', 'UNKNOWN missing support', 'undeclared positive rejected', 'unmapped producer rejected', 'unbound citation rejected', 'full excluded-feature veto', 'edit/source invalidation', 'duplicate confirm', 'cancel/late check', 'return', 'keyboard recheck']});
    await page.screenshot({path: '/tmp/growth-console-claims-' + width + '.png', fullPage: true});
    console.log('PASS claim Console ' + width + ': actual source HTTP/parser/SQLite and real static whitelist; source proof, full-context veto, normal/REVIEW/UNKNOWN, action veto and stale-result matrix');
    await context.close();
  }
  // Serve the exact delivery files over real local HTTP. The test relay calls
  // the same existing fixture API. No browser route.fulfill supplies assets.
  const manifest = JSON.parse(await readFile('delivery/growth-console/SHA256.json'));
  const requests = [];
  packaged = createServer(async (request, response) => {
    try {
      const path = new URL(request.url, 'http://localhost').pathname;
      requests.push(request.method + ' ' + path);
      if (path === '/api/product-source' && request.method === 'POST') {
        const chunks = []; for await (const chunk of request) chunks.push(chunk);
        fixture.kill('SIGUSR1');
        const upstream = await fetch(origin + path, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: Buffer.concat(chunks)});
        response.writeHead(upstream.status, {'Content-Type': 'application/json'}); response.end(await upstream.text()); return;
      }
      const name = path === '/growth-console' ? 'growth-console.html' : path.startsWith('/console-assets/') ? path.slice('/console-assets/'.length) : '';
      if (!Object.hasOwn(manifest.files, name)) {response.writeHead(404); response.end(); return;}
      response.writeHead(200, {'Content-Type': name.endsWith('.mjs') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : name.endsWith('.json') ? 'application/json' : 'text/html'});
      response.end(await readFile('delivery/growth-console/dist/' + name));
    } catch {response.writeHead(500); response.end();}
  });
  await new Promise(resolve => packaged.listen(0, '127.0.0.1', resolve));
  const packagedOrigin = 'http://127.0.0.1:' + packaged.address().port;
  const context = await browser.newContext({viewport: {width: 390, height: 900}, serviceWorkers: 'block'}), page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await context.route('**/*', route => new URL(route.request().url()).origin === packagedOrigin ? route.continue() : route.abort());
  await page.goto(packagedOrigin + '/growth-console');
  await page.locator('#source-url').fill('https://example.com/normal'); await page.locator('#source-submit').click();
  await page.locator('#claim-status').filter({hasText: 'REVIEW'}).waitFor();
  for (const key of ['title', 'meta_description', 'description']) await page.locator('#check-' + key).check();
  await page.locator('#review-confirm').click(); await page.locator('#review-state').filter({hasText: '本頁已確認'}).waitFor();
  assert.ok(requests.includes('GET /console-assets/console-claim-review.mjs'));
  assert.ok(requests.includes('GET /console-assets/console-claim-engine.mjs'));
  assert.deepEqual(errors, []);
  evidence.push({entry: '/growth-console', exact_delivery_package: true, requests, errors, synthetic: true, hosted_api_included: false});
  await context.close();
  console.log('PASS exact /growth-console delivery graph over real HTTP, with claim helper/engine; local fixture relay is not a hosted backend');
  await writeFile('/tmp/growth-console-claims-evidence.json', JSON.stringify(evidence, null, 2) + '\n');
} finally {
  if (packaged) await new Promise(resolve => packaged.close(resolve));
  await browser?.close();
  const stopped = new Promise(resolve => fixture.once('exit', resolve)); fixture.kill('SIGTERM'); await stopped;
  await rm(temp, {recursive: true, force: true});
}
