# Vercel Ignored Build Step (review candidate)

Scope: non-product tooling for `RC918/Growth-OS`, based on
`takeover/muse-primary-20261016` at
`33685368e81b440c62d18b796a7610b30a0b5ca5`. This patch does not install a
Dashboard setting or alter `vercel.json`, workflows, runtime flags, dependencies,
frozen contracts, or product files. It needs separate review and Owner approval
before activation. No repository commit, push, CI dispatch, or deployment is part
of this preparation.

## Dashboard command

Root Directory must be `./`. Paste the single line from
[`dashboard-command.txt`](dashboard-command.txt), without its trailing newline:

```sh
[ "${VERCEL_ENV:-}" = preview ] || exit 0; bash tools/vercel/ignored-build.sh
```

**77 ASCII characters / 77 UTF-8 bytes**, excluding the file's final newline;
the limit reported by Owner is 256 characters. This uses the Custom field so the
outer guard executes before Bash loads the repository script. Selecting a bare
repository-script command would omit this bootstrap protection.

The outer `[ ... ]` and `exit` are shell builtins. Production, empty, unset,
development and unknown environments return `0` before invoking Bash. Therefore
an old revision without the file, an unreadable file, a syntax error, or missing
Bash cannot accidentally allow Production through this command. Preview keeps
the script's exit code; a missing script/Bash or parse failure is nonzero and
continues the build. Do not append `|| exit 0` after the Bash invocation: that
would discard Preview build decisions.

The script is invoked using Bash and only needs read permission (mode `0644` is
sufficient). An executable bit is unnecessary. The relative Dashboard command
requires Root `./`; the script itself also resolves the Git root so a direct
absolute-path invocation works from a nested directory.

## Decision contract

| Condition | Result |
| --- | --- |
| `VERCEL_ENV=production` | `0`, skip |
| Environment unset, empty, or anything other than exact `preview` | `0`, skip |
| Preview on any branch except exact `takeover/muse-primary-20261016` (including missing branch) | `1`, build |
| Preview on that branch with missing/non-40-hex/unknown/non-commit previous SHA | `1`, build |
| Previous SHA is not a proven ancestor of `HEAD`; Git command error or insufficient shallow history | `1`, build |
| Only the exact Checkpoint file changes, or the deployment-to-HEAD diff is empty | `0`, skip |
| Any other path changes, including `apps/web/*.md`, other Markdown, config, dependencies, or this tooling | `1`, build |

The comparison is **`VERCEL_GIT_PREVIOUS_SHA` to `HEAD`**, never `HEAD^`. Vercel
documents this variable as the last successful deployment for the same project
and branch. The script relies on that provider-supplied identity; Git ancestry
alone cannot independently prove deployment success or branch identity. No
fallback comparison, fetch, network request, or automatic history deepening is
performed.

`git diff --no-renames --quiet` retains the positive `.` pathspec and exact
`:(top,exclude,literal)docs/Autonomous_Manager_Checkpoint_2026-10-18.md` exclusion.
Two conservative details supplement the supplied logic:

- `git cat-file -t` requires an actual commit object, excluding trees, blobs and
  annotated tag objects. `--no-ext-diff --no-textconv` avoids optional external
  helpers when computing the diff; every Git error still builds on Preview.
- Git literal pathspecs also match descendants of a directory. `git ls-tree -d`
  checks both endpoints and builds if the Checkpoint path is a directory, so a
  file-to-directory replacement cannot hide an unknown descendant. Both
  directions and `ls-tree` errors have regression coverage.

A shallow checkout can skip when both endpoints exist and ancestry is proven.
Missing objects or a shallow boundary that prevents proof build conservatively.
There is no blanket Markdown exemption.

## Offline verification

Requirements: Python 3.9+, Git, Bash, `/bin/sh`, and a non-root user for the real
unreadable-file check. No dependency install, credential, hosted service or
network access is needed. Tests create synthetic commits only inside disposable
temporary repositories, then remove those fixtures; they never commit in the
source repository. Git config and hooks are isolated.

```sh
bash -n tools/vercel/ignored-build.sh
python3 -B tools/vercel/test_ignored_build.py --history-repo . --output /tmp/growth-vercel-results.json
node --test tools/frozen-preflight.test.mjs
node tools/frozen-preflight.mjs --base 33685368e81b440c62d18b796a7610b30a0b5ca5
```

The full-history acceptance command requires these existing historical objects:
`ef44603`, `2eec93d`, `50cc26a`, `f9bf50a` and their parents. Missing history fails
the command; it is never recorded as a real-case pass. On a checkout that lacks
these objects, omit `--history-repo .` for synthetic-only verification; the
report explicitly marks real cases **NOT RUN**. Acquire history separately via
an authorized read-only operation if full historical coverage is needed.

Coverage consists of the supplied 32 final-command synthetic cases, four
equivalent exact-real-content fixtures, plus expanded cases:

- Production/empty/unset/unknown/staging/development/Preview crossed with
  missing, unreadable, syntax-error and side-effect-sentinel scripts under both
  `/bin/sh` and Bash; missing Bash is also tested. The sentinel proves
  non-Preview never invokes the script.
- Actual `file://` depth-1/depth-2 shallow clones, including a complete-enough
  range and a present previous object behind an unprovable shallow boundary.
- Missing Git, injected errors in every Git operation, non-ancestor and
  non-commit objects, malformed SHA forms, config/dependency/website/unknown
  paths, exact-file additions/deletions/mode changes, and renames across the
  exclusion boundary.
- Code followed by Checkpoint changes compares the entire deployment range.
  A deliberate last-commit-only negative control demonstrates the false skip
  that would result from choosing the wrong base.
- Each real case verifies the original changed-path set and exact before/after
  Git blob SHA before reconstructing a disposable content fixture. Four more
  checks use the actual historical parent/commit objects in isolated clones.
  Fixture commit IDs are explicitly synthetic, never presented as real IDs.

The old cloud test files were not available locally. The parent supplied their
source during this task; the 36 equivalent cases were rebuilt from that source
and real repository history. This is not a claim that unseen old files ran.
The older `test_final.py` development/empty-environment expectations are
superseded by Owner's current fail-closed contract and the supplied final-command
cases: every non-Preview environment skips.

The local frozen-preflight commands are existing offline CI steps, not a
GitHub Actions run. GitHub CI, Vercel runtime acceptance, Dashboard persistence,
and an independent Reviewer verdict remain **NOT RUN / pending** for this
uncommitted patch. No product build or UI/Auth/DB test is needed for the changed
non-product paths. No passing historical CI result establishes this patch's CI.

## Activation and rollback (instructions only)

After independent review and Owner approval, first ensure the reviewed script
is present on the intended branch and readable at Root `./`, then set the exact
77-character Dashboard Custom command. Revisions predating the script will
conservatively build on Preview while the outer guard keeps non-Preview skipped.
No activation is performed by this patch or its tests.

Before any future Dashboard edit, the authorized operator must privately save
the actual previous setting and project identity; this preparation has not read
or changed them. To undo an activation, restore that exact saved setting after
checking that it still meets the Production/unknown-environment requirements.
The old oversized command is not a usable fallback for a 256-character field.
For a temporary all-environment stop, an explicitly authorized operator can set
the Custom command to `exit 0`; this intentionally skips Preview as well.

Before the patch has been applied, rollback is simply to leave it unapplied.
In a separate clean checkout where it was applied, inspect
`git apply --reverse --check /path/to/ignored-build.patch` before reversing it;
preserve later edits. If removing the script after activation, restore the
Dashboard policy first: leaving the 77-character command with a missing script
allows Preview builds by design. Do not reset the user's working directory,
delete deployment history, redeploy, or change production resources as rollback.
