// Production-shaped adapters for the controller prototype. Each adapter does
// exactly one bounded operation per call: CI status is a single query (never
// --watch/polling), and an unfinished CI maps to PENDING so the controller
// records it and moves on instead of blocking unrelated work.
export function ciStatusOnce(exec) {
  return async () => {
    const out = await exec('gh', ['pr', 'checks', '31']);
    if (/pending|in_progress/i.test(out)) return 'PENDING';
    if (/\bfail|failure\b/i.test(out)) return 'FAIL';
    if (/\bpass\b/i.test(out)) return 'PASS';
    return 'BLOCKED';
  };
}

export function reviewerGate(spawnReviewer) {
  // REVIEW_PASS is granted by the controller only on an explicit APPROVE
  // verdict from the separate read-only reviewer; any failure stays blocked.
  return async (task) => {
    const verdict = await spawnReviewer(task);
    return verdict === 'APPROVE' ? 'APPROVE' : 'REVIEW_BLOCKED';
  };
}
