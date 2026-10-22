import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectGit, collectGitHub, formatStatus, checkDocFreshness, STATUS_FIELDS } from './status.mjs';

const HEAD = 'a'.repeat(40);

function fakeRunner(map) {
  return (cmd, args) => {
    const key = cmd + ' ' + args.join(' ');
    for (const [prefix, value] of Object.entries(map)) {
      if (key.startsWith(prefix)) {
        if (value instanceof Error) throw value;
        return value;
      }
    }
    throw new Error('unexpected command: ' + key);
  };
}

test('collectGit reports HEAD, branch and dirty count without touching files', () => {
  const git = collectGit(fakeRunner({
    'git rev-parse HEAD': HEAD,
    'git rev-parse --abbrev-ref HEAD': 'takeover/muse-primary-20261016',
    'git status --porcelain': ' M other.mjs\n?? new.mjs',
  }));
  assert.equal(git.head, HEAD);
  assert.match(git.worktree, /dirty\(2 entries/);
});

test('collectGitHub is single-shot and maps CI states honestly', () => {
  const ok = collectGitHub(fakeRunner({
    'gh pr view': JSON.stringify({ state: 'OPEN', isDraft: true, headRefOid: HEAD }),
    'gh api': JSON.stringify({ workflow_runs: [{ status: 'completed', conclusion: 'success' }] }),
  }), 'RC918/Growth-OS', 31, HEAD);
  assert.equal(ok.ci, 'SUCCESS');
  assert.equal(ok.pr_draft, 'true');

  const pending = collectGitHub(fakeRunner({
    'gh pr view': JSON.stringify({ state: 'OPEN', isDraft: true, headRefOid: HEAD }),
    'gh api': JSON.stringify({ workflow_runs: [{ status: 'in_progress', conclusion: null }] }),
  }), 'RC918/Growth-OS', 31, HEAD);
  assert.equal(pending.ci, 'PENDING');

  const down = collectGitHub(fakeRunner({
    'gh pr view': new Error('offline'),
    'gh api': new Error('offline'),
  }), 'RC918/Growth-OS', 31, HEAD);
  assert.equal(down.ci, 'UNKNOWN');
  assert.equal(down.pr_state, 'UNKNOWN');
});

test('formatStatus emits exactly the fixed fields in order', () => {
  const out = formatStatus({
    git: { head: HEAD, branch: 'b', worktree: 'clean' },
    github: { pr: '#31', pr_state: 'OPEN', pr_draft: 'true', pr_head: HEAD, ci: 'SUCCESS' },
    now: new Date('2026-10-22T00:00:00Z'),
  });
  const keys = out.trim().split('\n').map((l) => l.split(':')[0]);
  assert.deepEqual(keys.slice(0, 8), ['head', 'branch', 'pr', 'pr_state', 'pr_draft', 'pr_head_matches', 'ci', 'reviewer']);
  assert.ok(STATUS_FIELDS.includes('ci'));
  assert.ok(!/key|token|secret|password/i.test(out));
});

test('checkDocFreshness accepts verified ancestors and fails closed otherwise', () => {
  assert.equal(checkDocFreshness('head: ' + HEAD + '\n', HEAD).fresh, true);
  const older = 'b'.repeat(40);
  assert.equal(checkDocFreshness('head: ' + older + '\n', HEAD, (a) => a === older).fresh, true);
  assert.equal(checkDocFreshness('head: ' + older + '\n', HEAD, () => false).fresh, false);
  assert.equal(checkDocFreshness('no fields here\n', HEAD).fresh, false);
});
