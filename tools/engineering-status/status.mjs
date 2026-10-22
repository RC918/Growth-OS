// Read-only engineering status collector for Growth-OS handover.
//
// Emits the fixed-format status summary used by docs/Engineering_Status.md
// from live sources (local git worktree + single-shot GitHub queries), so a
// stale summary is never trusted silently. It never writes files, never
// reads credentials, and never calls any paid or production service.
//
// Usage:
//   node tools/engineering-status/status.mjs            # print summary
//   node tools/engineering-status/status.mjs --check docs/Engineering_Status.md
//                                                       # exit 1 if the doc
//                                                       # HEAD is stale
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

export const STATUS_FIELDS = [
  'head', 'branch', 'pr', 'pr_state', 'pr_draft',
  'ci', 'reviewer', 'worktree', 'updated_utc',
];

function run(cmd, args) {
  return execFileSync(cmd, args, { encoding: 'utf8', timeout: 30_000 }).trim();
}

export function collectGit(runner = run) {
  const git = (args) => runner('git', args);
  const dirty = git(['status', '--porcelain']).split('\n').filter(Boolean);
  return {
    head: git(['rev-parse', 'HEAD']),
    branch: git(['rev-parse', '--abbrev-ref', 'HEAD']),
    worktree: dirty.length === 0 ? 'clean' : `dirty(${dirty.length} entries, not owned by status tool)`,
  };
}

// Single-shot queries only: no --watch, no polling, no retries here.
export function collectGitHub(runner = run, repo = 'RC918/Growth-OS', prNumber = 31, head) {
  let pr = { pr: `#${prNumber}`, pr_state: 'UNKNOWN', pr_draft: 'UNKNOWN' };
  try {
    const raw = runner('gh', ['pr', 'view', String(prNumber), '--json', 'state,isDraft,headRefOid']);
    const parsed = JSON.parse(raw);
    pr = {
      pr: `#${prNumber}`,
      pr_state: parsed.state ?? 'UNKNOWN',
      pr_draft: parsed.isDraft ? 'true' : 'false',
      pr_head: parsed.headRefOid ?? 'UNKNOWN',
    };
  } catch { /* fail soft: UNKNOWN, never guessed */ }
  let ci = 'UNKNOWN';
  if (head) {
    try {
      const raw = runner('gh', ['api', `repos/${repo}/actions/runs?head_sha=${head}&per_page=20`]);
      const runs = JSON.parse(raw).workflow_runs ?? [];
      if (runs.length === 0) ci = 'NO_RUNS';
      else if (runs.some((r) => r.status !== 'completed')) ci = 'PENDING';
      else if (runs.every((r) => r.conclusion === 'success')) ci = 'SUCCESS';
      else ci = 'FAILURE';
    } catch { /* keep UNKNOWN */ }
  }
  return { ...pr, ci };
}

export function formatStatus({ git, github, reviewer = 'UNKNOWN', now = new Date() }) {
  const lines = [
    'head: ' + git.head,
    'branch: ' + git.branch,
    'pr: ' + github.pr,
    'pr_state: ' + github.pr_state,
    'pr_draft: ' + github.pr_draft,
    'pr_head_matches: ' + (github.pr_head ? String(github.pr_head === git.head) : 'UNKNOWN'),
    'ci: ' + github.ci,
    'reviewer: ' + reviewer,
    'worktree: ' + git.worktree,
    'updated_utc: ' + now.toISOString(),
  ];
  return lines.join('\n') + '\n';
}

// The committed doc is a snapshot, not a source of truth: --check compares
// its recorded HEAD with the live worktree HEAD and fails closed on drift.
export function checkDocFreshness(docText, liveHead) {
  const match = docText.match(/^head:\s*([0-9a-f]{40})\s*$/m);
  if (!match) return { fresh: false, reason: 'doc has no head field' };
  return match[1] === liveHead
    ? { fresh: true, reason: 'doc HEAD matches live HEAD' }
    : { fresh: false, reason: `doc HEAD ${match[1]} != live HEAD ${liveHead}` };
}

export function main(argv = process.argv.slice(2)) {
  const git = collectGit();
  const github = collectGitHub(run, 'RC918/Growth-OS', 31, git.head);
  const checkIndex = argv.indexOf('--check');
  if (checkIndex >= 0) {
    const doc = readFileSync(argv[checkIndex + 1], 'utf8');
    const result = checkDocFreshness(doc, git.head);
    console.log((result.fresh ? 'FRESH: ' : 'STALE: ') + result.reason);
    return result.fresh ? 0 : 1;
  }
  process.stdout.write(formatStatus({ git, github }));
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(main());
}
