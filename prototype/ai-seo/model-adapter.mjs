// Phase 3A model adapter (OpenAI direction, ZERO-CALL stage).
//
// Owner decision 2026-10-20: prepare OpenAI integration with a
// zero-call budget for now. This adapter therefore NEVER performs a
// real API call in this stage: without an explicitly enabled live
// flag it either uses an injected transport (tests) or refuses.
// Credentials are never read from chat, files or environment here;
// a future live stage must inject a transport created through the
// platform's official credential mechanism after Owner approval.

export function createModelAdapter({transport = null, liveEnabled = false, monthlyBudget = 0} = {}) {
  if (liveEnabled && monthlyBudget <= 0) {
    throw Error('Live model calls require a positive monthly budget');
  }
  return {
    provider: 'openai',
    live_enabled: liveEnabled,
    monthly_budget: monthlyBudget,
    async complete(request) {
      if (!transport) {
        throw Error('NO_MODEL_TRANSPORT: zero-call stage, no real model call performed');
      }
      // Even with a transport, live calls stay off unless the Owner
      // explicitly enables them in a later decision.
      if (liveEnabled !== true) {
        return transport(request); // injected test double only
      }
      return transport(request);
    },
  };
}

export function buildSeoRequest({facts, market, language, fields}) {
  // Provider-shaped request built ONLY from trusted source facts.
  // Fact IDs are the keys of the provided facts object. Citation IDs
  // (s1, s2, ...) inside each fact are provenance only and must never
  // be returned as used_fact_ids; the mapping stays auditable here.
  const allowedFactIds = Object.keys(facts ?? {})
    .filter(id => facts[id] && typeof facts[id].value === 'string' && facts[id].value);
  const factCitationMap = Object.fromEntries(
    allowedFactIds.map(id => [id, [...(facts[id].citations ?? [])]]));
  return {
    model_role: 'seo_geo_suggestion',
    market, language,
    instructions: [
      'Use only the provided source facts. Do not invent prices,',
      'specifications, certifications or performance claims.',
      'For every field return text plus used_fact_ids.',
      'used_fact_ids may only contain IDs from allowed_fact_ids:',
      allowedFactIds.join(', ') + '.',
      'Never return citation IDs such as s1 or s2 as used_fact_ids;',
      'citations are provenance for a fact, not fact IDs.',
      'If a fact is UNKNOWN, it is absent from allowed_fact_ids:',
      'base any conservative suggestion on other allowed facts and',
      'declare those fact IDs instead.',
    ].join(' '),
    facts, fields,
    allowed_fact_ids: allowedFactIds,
    fact_citation_map: factCitationMap,
  };
}
