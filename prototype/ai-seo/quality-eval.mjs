// Phase 3B quality evaluation gates (offline, deterministic).
//
// These are MACHINE GATES only: source-fact traceability, citation
// coverage, UNKNOWN preservation and conflict handling. They are not
// a quality score. Readability, search-intent fit and improvement
// value are scored by a human with the rubric in
// docs/Phase3B_OpenAI_Trial_Decision_Package_2026-10-20.md; an AI
// self-score is never accepted as quality evidence.

import {trustedFacts, verifySuggestions} from './ai-seo-pipeline.mjs';

// A fixture may only claim facts that its recorded snapshot actually
// supports: every cited id must exist in the snapshot registry and
// the fact value must appear in the cited quote(s). A null fact must
// be marked UNKNOWN with no citations. Synthetic cases must declare
// themselves instead of borrowing source authority.
export function validateFixtureBindings(testCase) {
  const problems = [];
  if (testCase.synthetic === true || testCase.kind === 'synthetic_negative') {
    if (!String(testCase.source_url ?? '').startsWith('synthetic://')) {
      problems.push('synthetic case must use a synthetic:// source_url');
    }
    return problems;
  }
  const registry = new Map((testCase.snapshot?.citations ?? []).map(c => [c.id, c]));
  if (registry.size === 0) problems.push('missing snapshot citation registry');
  for (const [key, fact] of Object.entries(testCase.report?.facts ?? {})) {
    if (!fact || fact.value == null) {
      if (fact?.verification !== 'UNKNOWN') problems.push(key + ': null fact not marked UNKNOWN');
      if ((fact?.citations ?? []).length > 0) problems.push(key + ': UNKNOWN fact carries citations');
      continue;
    }
    if (!Array.isArray(fact.citations) || fact.citations.length === 0) {
      problems.push(key + ': fact without citations');
      continue;
    }
    const quotes = [];
    for (const id of fact.citations) {
      const citation = registry.get(id);
      if (!citation) { problems.push(key + ': unknown citation ' + id); continue; }
      quotes.push(citation.quote ?? '');
    }
    if (quotes.length > 0 && !quotes.some(q => q.includes(fact.value) || fact.value.includes(q))) {
      problems.push(key + ': value not supported by cited quote(s)');
    }
  }
  return problems;
}

export function evaluateGeneration({report, suggestions}) {
  const facts = trustedFacts(report);
  const problems = verifySuggestions(suggestions, facts);

  // GEO Q&A: every answer must declare verifiable fact usage, and its
  // factual tokens must be traceable exactly like the SEO fields.
  const geoQa = suggestions?.geo_qa ?? [];
  if (!Array.isArray(geoQa) || geoQa.length === 0) {
    problems.push('geo_qa: missing structured Q&A suggestions');
  }
  for (const [index, qa] of geoQa.entries()) {
    const check = verifySuggestions(
      {title: {text: qa?.answer ?? '', used_fact_ids: qa?.used_fact_ids ?? []},
       meta_description: {text: 'x', used_fact_ids: ['product_name']},
       description: {text: 'x', used_fact_ids: ['product_name']}}, facts)
      .filter(p => p.startsWith('title'));
    for (const p of check) problems.push('geo_qa[' + index + ']: ' + p.slice('title: '.length));
    if (!qa?.question) problems.push('geo_qa[' + index + ']: missing question');
  }

  // Source conflicts stay unresolved: no generation may present a
  // conflicting fact as settled, and UNKNOWN facts stay UNKNOWN.
  const conflicts = report?.conflicts ?? [];
  const unknownFacts = Object.keys(facts).filter(k => !facts[k].value);
  const conflictingUsed = geoQa.concat(Object.values(suggestions ?? {}))
    .flatMap(s => s?.used_fact_ids ?? [])
    .filter(id => conflicts.some(c => c.fact === id));

  const status = problems.length > 0 ? 'FAIL_CLOSED'
    : (conflicts.length > 0 || unknownFacts.length > 0) ? 'PASS_WITH_UNKNOWNS' : 'PASS';
  return {
    status,
    problems,
    unknown_facts: unknownFacts,
    unresolved_conflicts: conflicts.map(c => c.fact),
    conflicting_fact_ids_used: [...new Set(conflictingUsed)],
    citation_coverage: Object.fromEntries(
      Object.entries(suggestions ?? {}).filter(([, v]) => v && typeof v === 'object' && 'used_fact_ids' in v)
        .map(([field, v]) => [field, (v.used_fact_ids ?? []).length > 0])),
    human_rubric_required: true,
  };
}
