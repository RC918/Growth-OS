// Trial-only composition: the original machine gate always retains veto power.
// Receipt fields below are not additions to the formal product report schema.
import {evaluateGeneration} from './quality-eval.mjs';
import {adaptClaimEvidence} from './claim-evidence-adapter.mjs';
import {verifyClaims} from './claim-verifier.mjs';

// Explicit evidence boundary, also usable to check caller-supplied excerpts.
// The runner supplies complete authoritative fields, never generated citations.
export function evaluateTrialClaimField({report, field, text, evidence}) {
  const mapped = adaptClaimEvidence({report, text, evidence});
  const verified = mapped.status === 'READY' ? verifyClaims(mapped.input) : {
    decision: 'FAIL_CLOSED', claims: [], problems: [mapped.reason],
  };
  return {
    field, text, evidence,
    mapping_status: mapped.status,
    decision: verified.decision,
    claims: verified.claims.map(claim => ({...claim, field})),
    problems: verified.problems.map(problem => field + ': ' + problem.replace(/^description: /, '')),
    review_required: verified.claims.some(claim => claim.status === 'REVIEW'),
  };
}

export function evaluateTrialGeneration({report, suggestions}) {
  const legacy = evaluateGeneration({report, suggestions});
  const entries = ['title', 'meta_description', 'description']
    .map(field => [field, suggestions?.[field]?.text, suggestions?.[field]?.used_fact_ids]);
  for (const [i, qa] of (suggestions?.geo_qa ?? []).entries()) {
    entries.push(['geo_qa[' + i + ']', qa?.answer, qa?.used_fact_ids]);
  }
  const fields = entries.map(([field, text, usedFactIds]) => {
    // Do not infer an id from text, fill UNKNOWN, select snippets, or import
    // undeclared fields. Invalid IDs remain invalid at the adapter boundary.
    const evidence = (Array.isArray(usedFactIds) ? usedFactIds : []).map(factId => ({
      fact_id: factId,
      quote_excerpt: report?.facts?.[factId]?.value ?? null,
      citation_ids: report?.facts?.[factId]?.citations ?? [],
    }));
    return {...evaluateTrialClaimField({report, field, text, evidence}),
      used_fact_ids: usedFactIds ?? []};
  });
  const problems = legacy.problems.concat(fields.flatMap(field => field.problems));
  const review = fields.some(field => field.review_required);
  const failed = legacy.status === 'FAIL_CLOSED' || fields.some(field => field.decision === 'FAIL_CLOSED');
  return {
    ...legacy,
    status: failed ? 'FAIL_CLOSED' : legacy.status,
    problems,
    claim_gate: {
      legacy_status: legacy.status,
      decision: failed ? 'FAIL_CLOSED' : review ? 'PASS_WITH_REVIEW' : 'PASS',
      review_status: review ? 'REVIEW' : 'NO_REVIEW_CLAIMS',
      review_required: review,
      fields,
    },
  };
}
