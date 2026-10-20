#!/usr/bin/env bash
# Vercel: 0 = skip; 1 = build. Keep the Dashboard ENV guard as well:
# old revisions may not contain this file, or Bash may fail to read/parse it.
case "${VERCEL_ENV:-}" in
  production) exit 0 ;;
  preview) ;;
  *) exit 0 ;;
esac

if [[ "${VERCEL_GIT_COMMIT_REF:-}" != takeover/muse-primary-20261016 ]]; then
  exit 1
fi

previous=${VERCEL_GIT_PREVIOUS_SHA:-}
if [[ ! "$previous" =~ ^[0-9a-fA-F]{40}$ ]]; then
  exit 1
fi

root=$(git rev-parse --show-toplevel) || exit 1
cd -- "$root" || exit 1
object_type=$(git cat-file -t "$previous") || exit 1
[[ "$object_type" == commit ]] || exit 1
git merge-base --is-ancestor "$previous" HEAD || exit 1

# A literal pathspec also matches descendants if the path becomes a directory.
# Reject that shape at either endpoint so only the single file can be excluded.
checkpoint=docs/Autonomous_Manager_Checkpoint_2026-10-18.md
for revision in "$previous" HEAD; do
  directory=$(git ls-tree -d "$revision" -- "$checkpoint") || exit 1
  [[ -z "$directory" ]] || exit 1
done

# Compare with the last successful deployment on this branch, never HEAD^.
# No rename detection: moving code to the excluded path must still build.
# Disable optional external diff/textconv helpers; errors also mean build.
if git diff --no-ext-diff --no-textconv --no-renames --quiet "$previous" HEAD -- . \
  ":(top,exclude,literal)$checkpoint"; then
  exit 0
fi
exit 1
