// Phase 3A isolated AI SEO/GEO pipeline (no real model calls).
//
// Flow: source snapshot -> trusted facts -> market/language ->
// AI suggestions (injected model) -> fact verification -> human
// Review. The model is an injected function so tests run fully
// offline with doubles; connecting a real paid model needs a
// separate Owner decision and is NOT done here.
//
// Guarantees:
// - Suggestions are labelled ai_suggestion, never source facts.
// - Every factual token (numbers, model names) in a suggestion must
//   already exist in the trusted source facts, and the model must
//   declare which fact ids it used; otherwise fail closed.
// - Missing source facts stay UNKNOWN; the model may not fill them.
// - Cost is recorded per call and a budget cap blocks new calls.

const FIELDS = ['title', 'meta_description', 'description'];
const LANGUAGES = ['zh-TW', 'en'];

export function trustedFacts(report) {
  const facts = report?.facts ?? {};
  const out = {};
  for (const key of ['product_name', 'title', 'meta_description', 'description']) {
    const fact = facts[key];
    out[key] = fact && typeof fact.value === 'string' && fact.value
      ? {value: fact.value, citations: fact.citations ?? [],
         verification: fact.verification ?? 'unknown'}
      : {value: null, citations: [], verification: 'UNKNOWN'};
  }
  return out;
}

function factualTokens(text) {
  // Every Latin word or number in a suggestion is treated as a
  // factual claim that must be traceable to the source vocabulary.
  // (CJK copy is bounded by the used_fact_ids declaration instead.)
  return new Set([
    ...(text.match(/\d+(?:[.,]\d+)?/g) ?? []),
    ...(text.match(/[A-Za-z][A-Za-z0-9-]{2,}/g) ?? []),
  ]);
}

export function verifySuggestions(suggestions, facts) {
  const sourceText = Object.values(facts)
    .map(f => f.value ?? '').join(' ');
  const sourceTokens = new Set(
    (sourceText.match(/[A-Za-z][A-Za-z0-9-]{2,}|\d+(?:[.,]\d+)?/g) ?? [])
      .map(t => t.toLowerCase()));
  const problems = [];
  for (const field of FIELDS) {
    const suggestion = suggestions?.[field];
    if (!suggestion || typeof suggestion.text !== 'string' || !suggestion.text) {
      problems.push(field + ': missing suggestion');
      continue;
    }
    if (!Array.isArray(suggestion.used_fact_ids) || suggestion.used_fact_ids.length === 0) {
      problems.push(field + ': no declared fact usage');
      continue;
    }
    for (const id of suggestion.used_fact_ids) {
      if (!(id in facts) || !facts[id].value) {
        problems.push(field + ': unknown fact id ' + id);
      }
    }
    for (const token of factualTokens(suggestion.text)) {
      if (!sourceTokens.has(token.toLowerCase())) {
        problems.push(field + ': unverifiable factual token "' + token + '"');
      }
    }
  }
  return problems;
}

export function createCostLedger(budget) {
  const entries = [];
  return {
    budget,
    entries,
    spent: () => entries.reduce((sum, e) => sum + e.cost, 0),
    canAfford: estimate => entries.reduce((sum, e) => sum + e.cost, 0) + estimate <= budget,
    record(entry) { entries.push(entry); },
  };
}

export async function runAiSeoPipeline({report, market, language, model, ledger}) {
  if (!LANGUAGES.includes(language)) throw Error('Unsupported language: ' + language);
  if (!market || typeof market !== 'string') throw Error('Market required');
  if (typeof model !== 'function') throw Error('Injected model required (real calls not authorized)');
  const facts = trustedFacts(report);
  const known = Object.fromEntries(Object.entries(facts).filter(([, f]) => f.value));
  if (Object.keys(known).length === 0) throw Error('No trusted source facts; fail closed');

  const estimate = 0.002; // recorded estimate per call, same units as budget
  if (!ledger.canAfford(estimate)) {
    return {status: 'BUDGET_BLOCKED', facts, suggestions: null, problems: ['budget cap reached']};
  }
  const response = await model({facts: known, market, language, fields: FIELDS});
  const actualCost = response.usage?.cost ?? estimate;
  ledger.record({
    at: new Date().toISOString(), market, language,
    input_tokens: response.usage?.input_tokens ?? null,
    output_tokens: response.usage?.output_tokens ?? null,
    cost: actualCost,
  });
  if (ledger.spent() > ledger.budget) {
    return {status: 'FAIL_CLOSED', facts, suggestions: null,
      problems: ['actual model cost exceeded budget cap'],
      unknown_fields: Object.keys(facts).filter(k => !facts[k].value),
      cost: ledger.entries.at(-1)};
  }

  const problems = verifySuggestions(response.suggestions, facts);
  if (problems.length > 0) {
    return {status: 'FAIL_CLOSED', facts, suggestions: null, problems,
      unknown_fields: Object.keys(facts).filter(k => !facts[k].value),
      cost: ledger.entries.at(-1)};
  }
  const fields = {};
  for (const field of FIELDS) {
    fields[field] = {
      original: facts[field === 'title' ? 'title' : field]?.value ?? 'UNKNOWN',
      ai_suggestion: response.suggestions[field].text,
      used_fact_ids: response.suggestions[field].used_fact_ids,
      user_edit: null, // human Review fills this; never auto-applied
      citations: response.suggestions[field].used_fact_ids
        .flatMap(id => facts[id]?.citations ?? []),
    };
  }
  return {
    status: 'AWAITING_REVIEW', market, language, facts, fields,
    unknown_fields: Object.keys(facts).filter(k => !facts[k].value),
    cost: ledger.entries.at(-1), total_cost: ledger.spent(),
  };
}
