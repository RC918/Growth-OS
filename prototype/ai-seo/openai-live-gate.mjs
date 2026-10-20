// Phase 3B OpenAI live gate (PREPARATION ONLY, transport disabled).
//
// Owner authorization 2026-10-20: prepare the OpenAI integration and
// quality acceptance, but perform NO real paid API call. The transport
// below therefore refuses unless a future Owner decision explicitly
// enables it AND a credential provider created through the official
// OpenAI project mechanism is injected. No API key is read from files,
// chat, Checkpoint or this module; tests inject a fake fetch only.
//
// Pricing/model facts checked 2026-10-20 against official docs:
// - Model: gpt-5-mini (snapshot gpt-5-mini-2025-08-07), Responses API
//   and structured_outputs supported.
// - Text pricing: input US$0.25 / 1M tokens, cached input US$0.025,
//   output US$2.00 / 1M tokens.
//   Source: https://developers.openai.com/api/docs/models/gpt-5-mini
// - Vendor hard limits exist (organization/project hard spend limit
//   returning 429 *_spend_limit_exceeded, enforcement not instant);
//   alerts alone do NOT stop traffic.
//   Source: https://developers.openai.com/api/docs/guides/spend-limits

export const OPENAI_MODEL = {
  model: 'gpt-5-mini',
  snapshot: 'gpt-5-mini-2025-08-07',
  inputPerMillion: 0.25,
  cachedInputPerMillion: 0.025,
  outputPerMillion: 2.0,
  pricingSource: 'https://developers.openai.com/api/docs/models/gpt-5-mini',
  checked: '2026-10-20',
};

export function estimateCost({inputTokens = 0, outputTokens = 0} = {}) {
  return (inputTokens * OPENAI_MODEL.inputPerMillion
    + outputTokens * OPENAI_MODEL.outputPerMillion) / 1_000_000;
}

// Application-side SOFT trial budget. This is our own ledger, not a
// vendor guarantee: the vendor-side hard stop must additionally be
// configured as a project hard spend limit (see decision package).
export function createTrialBudget({
  trialCapUsd = 5,
  maxRequests = 12,
  maxInputTokensPerRequest = 2000,
  maxOutputTokensPerRequest = 1000,
} = {}) {
  const entries = [];
  let stopped = null;
  const spent = () => entries.reduce((sum, e) => sum + e.cost, 0);
  return {
    cap: trialCapUsd,
    entries,
    spent,
    remaining: () => trialCapUsd - spent(),
    get stopped() { return stopped; },
    stop(reason) { stopped = reason ?? 'manual stop'; },
    preflight({inputTokens, outputTokens}) {
      if (stopped) throw Error('TRIAL_STOPPED: ' + stopped);
      if (entries.length >= maxRequests) throw Error('TRIAL_REQUEST_CAP reached');
      if (inputTokens > maxInputTokensPerRequest) throw Error('TRIAL_INPUT_TOKEN_CAP exceeded');
      if (outputTokens > maxOutputTokensPerRequest) throw Error('TRIAL_OUTPUT_TOKEN_CAP exceeded');
      const estimate = estimateCost({inputTokens, outputTokens});
      if (spent() + estimate > trialCapUsd) throw Error('TRIAL_BUDGET_CAP would be exceeded');
      return estimate;
    },
    record({inputTokens, outputTokens}) {
      const cost = estimateCost({inputTokens, outputTokens});
      entries.push({input_tokens: inputTokens, output_tokens: outputTokens, cost});
      if (spent() > trialCapUsd) stopped = 'actual spend exceeded trial cap';
      return cost;
    },
  };
}

export function classifyApiError({status, code} = {}) {
  if (status === 429 && typeof code === 'string' && code.endsWith('spend_limit_exceeded')) {
    return 'SPEND_LIMIT'; // vendor hard limit: stop, never retry
  }
  if (status === 429) return 'RATE_LIMIT'; // retryable within caps
  if (status >= 500) return 'SERVER'; // retryable within caps
  if (status >= 400) return 'CLIENT'; // our request is wrong: no retry
  return 'UNKNOWN';
}

const SUGGESTION_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['title', 'meta_description', 'description', 'geo_qa'],
  properties: {
    title: {type: 'object', additionalProperties: false, required: ['text', 'used_fact_ids'],
      properties: {text: {type: 'string'}, used_fact_ids: {type: 'array', items: {type: 'string'}}}},
    meta_description: {type: 'object', additionalProperties: false, required: ['text', 'used_fact_ids'],
      properties: {text: {type: 'string'}, used_fact_ids: {type: 'array', items: {type: 'string'}}}},
    description: {type: 'object', additionalProperties: false, required: ['text', 'used_fact_ids'],
      properties: {text: {type: 'string'}, used_fact_ids: {type: 'array', items: {type: 'string'}}}},
    geo_qa: {type: 'array', items: {type: 'object', additionalProperties: false,
      required: ['question', 'answer', 'used_fact_ids'],
      properties: {question: {type: 'string'}, answer: {type: 'string'},
        used_fact_ids: {type: 'array', items: {type: 'string'}}}}},
  },
};

export function createOpenAiTransport({
  enabled = false,
  credentialProvider = null,
  fetchImpl = null,
  budget = null,
  timeoutMs = 30000,
  sleep = async () => {},
} = {}) {
  return async function openAiTransport(request) {
    // Default-deny: no future Owner enable decision, no call at all.
    if (enabled !== true) throw Error('LIVE_TRANSPORT_DISABLED: Owner enable decision required');
    if (typeof credentialProvider !== 'function') throw Error('CREDENTIAL_PROVIDER_REQUIRED');
    if (typeof fetchImpl !== 'function') throw Error('FETCH_REQUIRED');
    if (!budget) throw Error('TRIAL_BUDGET_REQUIRED');

    const inputTokens = request.estimated_input_tokens ?? 1200;
    const outputTokens = request.max_output_tokens ?? 800;
    budget.preflight({inputTokens, outputTokens});

    const body = {
      model: OPENAI_MODEL.snapshot,
      input: [{role: 'system', content: request.instructions},
              {role: 'user', content: JSON.stringify({facts: request.facts, market: request.market, language: request.language})}],
      text: {format: {type: 'json_schema', name: 'seo_geo_suggestions', strict: true, schema: SUGGESTION_SCHEMA}},
      max_output_tokens: outputTokens,
    };

    let retried = false;
    for (;;) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const aborted = new Promise((_, reject) => {
        controller.signal.addEventListener('abort', () => reject(Error('aborted')), {once: true});
      });
      let response;
      try {
        response = await Promise.race([fetchImpl('https://api.openai.com/v1/responses', {
          method: 'POST',
          headers: {authorization: 'Bearer ' + credentialProvider(), 'content-type': 'application/json'},
          body: JSON.stringify(body),
          signal: controller.signal,
        }), aborted]);
      } catch {
        // A timeout/abort after the request may already be billed by
        // the vendor and the Responses API has no idempotency key, so
        // an automatic retry could double-charge. Never retry here.
        throw Error('UNKNOWN_OUTCOME: request may have been billed; reconcile before any retry');
      } finally {
        clearTimeout(timer);
      }
      if (response.ok) {
        const data = await response.json();
        const usage = data.usage ?? {};
        const cost = budget.record({
          inputTokens: usage.input_tokens ?? inputTokens,
          outputTokens: usage.output_tokens ?? outputTokens,
        });
        return {suggestions: JSON.parse(data.output_text), usage: {
          input_tokens: usage.input_tokens ?? null,
          output_tokens: usage.output_tokens ?? null, cost}};
      }
      const errorBody = await response.json().catch(() => ({}));
      const kind = classifyApiError({status: response.status, code: errorBody?.error?.code});
      if (kind === 'SPEND_LIMIT') {
        budget.stop('vendor spend limit reached: ' + errorBody.error.code);
        throw Error('VENDOR_SPEND_LIMIT: trial stopped, do not retry');
      }
      if ((kind === 'RATE_LIMIT' || kind === 'SERVER') && !retried) {
        retried = true;
        const retryAfter = Number(response.headers?.get?.('retry-after') ?? 1);
        await sleep(Math.min(retryAfter, 30) * 1000);
        continue;
      }
      throw Error('OPENAI_' + kind + ': HTTP ' + response.status);
    }
  };
}
