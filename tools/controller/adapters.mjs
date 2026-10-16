// Structured GitHub Check Runs adapter: one bounded query per call, dynamic
// repo/PR/SHA, and a verdict only when every required check for the exact
// HEAD has completed successfully. Any failure fails, any pending pends.
export function ciStatusOnce({exec, repo, pr, headSha, required = ['test']}) {
  return async () => {
    const out = await exec('gh', ['api', `repos/${repo}/commits/${headSha}/check-runs`, '--jq', '.check_runs']);
    const runs = JSON.parse(out);
    const latest = new Map();
    for (const r of runs) if (!latest.has(r.name) || r.id > latest.get(r.name).id) latest.set(r.name, r);
    let pending = false;
    for (const name of required) {
      const r = latest.get(name);
      if (!r) return 'BLOCKED'; // required check missing for this HEAD
      if (r.status !== 'completed') { pending = true; continue; }
      if (r.conclusion !== 'success') return 'FAIL';
    }
    return pending ? 'PENDING' : 'PASS';
  };
}

export function reviewerGate(spawnReviewer) {
  return async (task) => spawnReviewer(task); // verdict object validated by Controller
}
