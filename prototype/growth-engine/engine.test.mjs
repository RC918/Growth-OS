import test from 'node:test';
import assert from 'node:assert/strict';
import {createGrowthEngine} from './engine.mjs';

const io = {
  analyze: async task => ({summary: 'facts ready for ' + task.key}),
  execute: async task => ({artifact: 'draft:' + task.key}),
  verify: async () => ({ok: true}),
};

test('happy path requires a human gate and completes with audit trail', async () => {
  const engine = createGrowthEngine({budget: 1});
  const task = engine.submit({key: 'url-1', title: 'Optimize', tier: 'L1_isolated', estimate: 0.1});
  await engine.run(task.id, io);
  assert.equal(task.state, 'awaiting_approval');
  await assert.rejects(engine.approveAndExecute(task.id, {execute: io.execute, verify: io.verify}));
  const done = await engine.approveAndExecute(task.id,
    {approved_by: 'owner', execute: io.execute, verify: io.verify});
  assert.equal(done.state, 'done');
  assert.ok(engine.audit.some(e => e.event === 'approved'));
  assert.equal(engine.spent(), 0.1);
});

test('duplicate submission is idempotent and production tier escalates', async () => {
  const engine = createGrowthEngine({budget: 1});
  const a = engine.submit({key: 'dup', title: 'A', tier: 'L1_isolated'});
  const b = engine.submit({key: 'dup', title: 'A again', tier: 'L1_isolated'});
  assert.equal(a.id, b.id);
  const prod = engine.submit({key: 'prod', title: 'P', tier: 'L2_production'});
  await engine.run(prod.id, io);
  assert.equal(prod.state, 'escalated');
});

test('retry cap escalates with state preserved; budget cap escalates', async () => {
  const engine = createGrowthEngine({budget: 0.05, maxRetries: 1});
  const pricey = engine.submit({key: 'pricey', title: 'X', tier: 'L1_isolated', estimate: 0.5});
  await engine.run(pricey.id, io);
  assert.equal(pricey.state, 'escalated');

  const engine2 = createGrowthEngine({budget: 10, maxRetries: 1});
  const flaky = engine2.submit({key: 'flaky', title: 'F', tier: 'L1_isolated'});
  await engine2.run(flaky.id, io);
  let calls = 0;
  const out = await engine2.approveAndExecute(flaky.id, {
    approved_by: 'owner',
    execute: async () => { calls++; throw Error('boom'); },
    verify: io.verify,
  });
  assert.equal(out.state, 'escalated');
  assert.equal(calls, 2); // first try + one retry, then cap
  assert.ok(engine2.audit.some(e => e.event === 'escalated'));
});

test('failed verification escalates instead of marking done', async () => {
  const engine = createGrowthEngine({budget: 1});
  const task = engine.submit({key: 'v', title: 'V', tier: 'L0_readonly'});
  await engine.run(task.id, io);
  const out = await engine.approveAndExecute(task.id, {
    approved_by: 'owner', execute: io.execute,
    verify: async () => ({ok: false, detail: 'fact mismatch'}),
  });
  assert.equal(out.state, 'escalated');
});
