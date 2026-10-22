// Optional offline boundary. Does not alter source fields or the product report schema.
// Excerpts alone cannot prove their field, citation binding or conflict state.
export function adaptClaimEvidence({text, evidence, report} = {}) {
  const blocked = reason => ({status: 'BLOCKED_INPUT_MAPPING_AMBIGUITY', reason, input: null});
  if (typeof text !== 'string' || !text.trim() || !Array.isArray(evidence) || !evidence.length
    || !report?.facts) return blocked('authoritative report and non-empty evidence required');
  if (report.conflicts && (Array.isArray(report.conflicts) ? report.conflicts.length : Object.keys(report.conflicts).length)) {
    return {status: 'BLOCKED_SOURCE_CONFLICT', reason: 'unresolved report conflicts', input: null};
  }
  const facts = Object.fromEntries(['product_name', 'title', 'meta_description', 'description']
    .map(key => [key, {value: null, citations: [], verification: 'UNKNOWN'}]));
  const ids = [];
  for (const e of evidence) {
    if (!e || typeof e !== 'object') return blocked('malformed evidence');
    const f = report.facts[e.fact_id];
    if (!(e.fact_id in facts) || !f || typeof f.value !== 'string'
      || typeof e.quote_excerpt !== 'string' || !e.quote_excerpt || e.quote_excerpt === 'UNKNOWN'
      || !f.value.includes(e.quote_excerpt) || !Array.isArray(e.citation_ids) || !e.citation_ids.length
      || !Array.isArray(f.citations) || !e.citation_ids.every(id => f.citations.includes(id))) {
      return blocked('excerpt or citation is not bound to its declared authoritative field');
    }
    // Substring identity cannot establish polarity or absence of conflicts.
    // Retain the excerpt-only boundary by accepting complete fields only.
    if (e.quote_excerpt !== f.value) return blocked('partial excerpt cannot establish complete field context');
    if (f.verification === 'conflicting') return {status: 'BLOCKED_SOURCE_CONFLICT', reason: 'conflicting field', input: null};
    if (!['source_asserted', 'verified'].includes(f.verification)) return blocked('source verification is unknown');
    const dest = facts[e.fact_id];
    dest.value = dest.value === null ? e.quote_excerpt : dest.value + '\n' + e.quote_excerpt;
    dest.citations.push(...e.citation_ids);
    dest.verification = f.verification;
    if (!ids.includes(e.fact_id)) ids.push(e.fact_id);
  }
  return {status: 'READY', input: {suggestions: {description: {text, used_fact_ids: ids}}, facts: {facts}}};
}
