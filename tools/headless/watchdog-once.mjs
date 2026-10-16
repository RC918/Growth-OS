#!/usr/bin/env node
// One-shot controlled Watchdog entry for a native Mac terminal. Runs exactly
// one already-authorized read-only/synthetic task through the Controller ->
// Headless Coder loop, then exits. No schedule, no push, no merge, no deploy.
//   node tools/headless/watchdog-once.mjs --synthetic
//   node tools/headless/watchdog-once.mjs --task-id watchdog-real-001
import {Controller} from '../controller/controller.mjs';
import {Watchdog} from '../controller/watchdog.mjs';
import {createHeadlessCoder} from './headless-adapter.mjs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const argv = process.argv.slice(2);
const synthetic = argv.includes('--synthetic');
const taskId = argv.includes('--task-id') ? argv[argv.indexOf('--task-id') + 1] : 'watchdog-synthetic-001';
const dir = argv.includes('--state-dir') ? argv[argv.indexOf('--state-dir') + 1] : join(dirname(fileURLToPath(import.meta.url)), '.watchdog-state');
const started = Date.now();
const controller = new Controller({
  dir,
  sessionId: 'controller-session',
  tools: {
    plan: async () => {},
    code: createHeadlessCoder({synthetic, timeoutMs: 120_000, state: join(dir, 'headless-checkpoint.json')}),
    test: async () => 'PASS', // synthetic/read-only task: offline checks only
    build: async () => 'PASS',
    e2e: async () => 'PASS',
    // Never self-approve: an independent reviewer session writes a verdict
    // file bound to this commit; without it this stage stays REVIEW_BLOCKED.
    review: async () => {
      const vf = argv.includes('--verdict') ? argv[argv.indexOf('--verdict') + 1] : null;
      if (!vf) throw Object.assign(new Error('awaiting independent reviewer'), {code: 'REVIEW_PENDING'});
      const {readFile} = await import('node:fs/promises');
      return JSON.parse(await readFile(vf, 'utf8')); // Controller validates source/session/SHA/completed
    },
    preview: async () => 'PASS',
    gitHead: async () => 'controlled-trial',
    gitClean: async () => true,
    isAlive: async () => false,
  },
});
const watchdog = new Watchdog({controller, inspect: {}, notify: async (major) => console.log(JSON.stringify({notify: major}))});
await watchdog.tick('manual-once'); // resumes any pending checkpointed task first
const task = await controller.run({id: taskId, commit: 'controlled-trial', payload: {mode: synthetic ? 'synthetic' : 'real-readonly', singleTask: true}});
console.log(JSON.stringify({task: task.id, status: task.status, stages: Object.fromEntries(Object.entries(task.stages).map(([k, v]) => [k, v.status])), elapsedMs: Date.now() - started, budgetMs: 3_600_000}));
process.exit(task.status === 'REVIEW_PASS' ? 0 : 1);
