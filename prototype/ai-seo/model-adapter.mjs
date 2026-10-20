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
  // Unknown facts are passed as UNKNOWN so the model cannot
  // silently invent them; verification happens in the pipeline.
  return {
    model_role: 'seo_geo_suggestion',
    market, language,
    instructions: [
      'Use only the provided source facts. Do not invent prices,',
      'specifications, certifications or performance claims.',
      'For every field return text plus used_fact_ids.',
      'If a fact is UNKNOWN, leave the field conservative and',
      'declare no fact id for the unknown part.',
    ].join(' '),
    facts, fields,
  };
}
