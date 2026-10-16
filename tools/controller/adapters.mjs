// Structured GitHub Check Runs adapter: paginated single-purpose queries for
// the PR's exact HEAD. Missing, unknown, or unfinished required checks never
// count as green; reruns collapse to the latest run per check name.
export function ciStatusOnce({exec, repo, headSha, required = ['test']}) {
  return async () => {
    const runs = [];
    for (let page = 1; page <= 10; page++) {
      const out = await exec('gh', ['api', `repos/${repo}/commits/${headSha}/check-runs?per_page=100&page=${page}`, '--jq', '.check_runs']);
      const batch = JSON.parse(out); runs.push(...batch);
      if (batch.length < 100) break;
    }
    const latest = new Map();
    for (const r of runs) if (!latest.has(r.name) || r.id > latest.get(r.name).id) latest.set(r.name, r);
    let pending = false;
    for (const name of required) {
      const r = latest.get(name);
      if (!r) return 'BLOCKED';
      if (r.status !== 'completed') { pending = true; continue; }
      if (!['success'].includes(r.conclusion)) return 'FAIL'; // failure/neutral/cancelled/skipped are not green
    }
    return pending ? 'PENDING' : 'PASS';
  };
}
export function reviewerGate(spawnReviewer) { return async (task) => spawnReviewer(task); }
