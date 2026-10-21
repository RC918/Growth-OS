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

// Per-request token caps shared by the API request and the budget
// gate, so the two can never drift apart. GPT-5 reasoning tokens are
// billed and counted as output tokens: the previous 800-token output
// request ended incomplete (max_output_tokens) on a real call before
// the strict JSON suggestions were finished. 3000 leaves room for
// reasoning plus the visible JSON (a few hundred tokens), while the
// preflight worst case stays at 1200 in / 3000 out = US$0.0063 per
// request, far below the US$5 trial cap even at 12 requests.
export const TRIAL_TOKEN_CAPS = Object.freeze({
  inputPerRequest: 2000,
  outputPerRequest: 3000,
});

export function estimateCost({inputTokens = 0, outputTokens = 0} = {}) {
  return (inputTokens * OPENAI_MODEL.inputPerMillion
    + outputTokens * OPENAI_MODEL.outputPerMillion) / 1_000_000;
}

// Only these non-secret diagnostic fields may ever enter the attempt
// ledger or an error object. Authorization headers, API keys and any
// other response fields are never copied.
const SAFE_ATTEMPT_FIELDS = ['http_status', 'error_type', 'error_code', 'request_id', 'outcome'];
export function safeAttemptFields(fields = {}) {
  const safe = {};
  for (const key of SAFE_ATTEMPT_FIELDS) {
    const value = fields[key];
    if (value == null) continue;
    safe[key] = key === 'http_status' ? Number(value) || null : String(value).slice(0, 128);
  }
  return safe;
}

export function safeApiErrorFields({status, errorBody, response} = {}) {
  const error = errorBody?.error ?? {};
  const requestId = errorBody?.request_id ?? error?.request_id
    ?? response?.headers?.get?.('x-request-id') ?? null;
  return safeAttemptFields({
    http_status: status ?? null,
    error_type: typeof error?.type === 'string' ? error.type : null,
    error_code: typeof error?.code === 'string' ? error.code : null,
    request_id: typeof requestId === 'string' ? requestId : null,
  });
}

export function makeApiError(message, fields = {}) {
  const error = Error(message);
  error.apiError = safeAttemptFields(fields);
  error.httpStatus = error.apiError.http_status ?? null;
  return error;
}

// Application-side SOFT trial budget. This is our own ledger, not a
// vendor guarantee: the vendor-side hard stop must additionally be
// configured as a project hard spend limit (see decision package).
export function createTrialBudget({
  trialCapUsd = 5,
  maxRequests = 12,
  maxInputTokensPerRequest = TRIAL_TOKEN_CAPS.inputPerRequest,
  maxOutputTokensPerRequest = TRIAL_TOKEN_CAPS.outputPerRequest,
} = {}) {
  const entries = [];
  const attempts = [];
  let stopped = null;
  const spent = () => entries.reduce((sum, e) => sum + e.cost, 0);
  return {
    cap: trialCapUsd,
    maxRequests,
    maxInputTokensPerRequest,
    maxOutputTokensPerRequest,
    entries,
    attempts,
    spent,
    remaining: () => trialCapUsd - spent(),
    get stopped() { return stopped; },
    stop(reason) { stopped = reason ?? 'manual stop'; },
    preflight({inputTokens, outputTokens}) {
      if (stopped) throw Error('TRIAL_STOPPED: ' + stopped);
      // Every HTTP send counts toward the cap, including failures and
      // retries, so a failing or retried request can never bypass it.
      if (attempts.length >= maxRequests) throw Error('TRIAL_REQUEST_CAP reached');
      if (inputTokens > maxInputTokensPerRequest) throw Error('TRIAL_INPUT_TOKEN_CAP exceeded');
      if (outputTokens > maxOutputTokensPerRequest) throw Error('TRIAL_OUTPUT_TOKEN_CAP exceeded');
      const estimate = estimateCost({inputTokens, outputTokens});
      if (spent() + estimate > trialCapUsd) throw Error('TRIAL_BUDGET_CAP would be exceeded');
      return estimate;
    },
    recordAttempt(fields = {}) {
      const attempt = {
        attempt: attempts.length + 1,
        at: new Date().toISOString(),
        http_status: null, error_type: null, error_code: null,
        request_id: null, outcome: 'sent',
        ...safeAttemptFields(fields),
      };
      attempts.push(attempt);
      return attempt;
    },
    updateAttempt(attempt, fields = {}) {
      if (attempt) Object.assign(attempt, safeAttemptFields(fields));
      return attempt;
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

// Conservative input-token ESTIMATE (not an exact token count) for
// everything that shapes the request input: system instructions, the
// serialized user payload, the strict JSON Schema and the fixed
// request envelope. Counting method, chosen to stay above typical
// tokenizer output without pretending to be a tokenizer:
// - non-Latin-1 code points (including CJK) count as 1 token each;
// - Latin-1 / ASCII code points count as 1/3 token each (English text
//   averages roughly 4 characters per token, punctuation denser);
// - the sum is scaled by 1.25 and padded by 32 tokens for envelope
//   and tokenizer variance.
// Callers may supply a larger estimate, never a smaller one.
export function estimateTokensConservatively(text = '') {
  let units = 0;
  for (const ch of String(text)) {
    units += ch.codePointAt(0) > 0xff ? 1 : 1 / 3;
  }
  return Math.ceil(units * 1.25) + 32;
}

export function estimateInputTokens({instructions = '', userContent = '', schemaText = '', envelopeText = ''} = {}) {
  return estimateTokensConservatively(
    String(instructions) + String(userContent) + String(schemaText) + String(envelopeText));
}

// Parse a raw Responses API payload. The REST response does not
// guarantee a top-level output_text helper field: the text lives in
// output[].content[] parts of type output_text. Refusals, incomplete
// runs and malformed content are explicit failures, never parsed as
// the literal string "undefined".
export function parseResponsesSuggestions(data) {
  const requestId = typeof data?.id === 'string' ? data.id : null;
  const base = {http_status: 200, request_id: requestId};
  if (!data || typeof data !== 'object') {
    throw makeApiError('OPENAI_FORMAT: response body is not an object',
      {...base, error_type: 'format_error', error_code: 'missing_output_text'});
  }
  if (data.status === 'incomplete') {
    throw makeApiError('OPENAI_INCOMPLETE: response did not complete',
      {...base, error_type: 'incomplete',
        error_code: data.incomplete_details?.reason ?? 'incomplete'});
  }
  if (data.status && data.status !== 'completed') {
    throw makeApiError('OPENAI_RESPONSE_NOT_COMPLETED: status ' + String(data.status).slice(0, 32),
      {...base, error_type: typeof data.error?.type === 'string' ? data.error.type : 'response_status',
        error_code: typeof data.error?.code === 'string' ? data.error.code : String(data.status).slice(0, 32)});
  }
  const parts = [];
  let refusal = null;
  for (const item of Array.isArray(data.output) ? data.output : []) {
    for (const content of Array.isArray(item?.content) ? item.content : []) {
      if (content?.type === 'output_text' && typeof content.text === 'string') parts.push(content.text);
      if (content?.type === 'refusal') refusal = content.refusal ?? 'refused';
    }
  }
  if (refusal != null) {
    throw makeApiError('OPENAI_REFUSAL: model refused the request',
      {...base, error_type: 'refusal', error_code: 'refusal'});
  }
  const text = typeof data.output_text === 'string' && data.output_text.length > 0
    ? data.output_text : parts.join('');
  if (!text) {
    throw makeApiError('OPENAI_FORMAT: response contains no output text',
      {...base, error_type: 'format_error', error_code: 'missing_output_text'});
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw makeApiError('OPENAI_FORMAT: output text is not valid JSON',
      {...base, error_type: 'format_error', error_code: 'invalid_json'});
  }
  for (const field of ['title', 'meta_description', 'description']) {
    if (!parsed || typeof parsed !== 'object'
      || !parsed[field] || typeof parsed[field] !== 'object') {
      throw makeApiError('OPENAI_FORMAT: suggestions missing field ' + field,
        {...base, error_type: 'format_error', error_code: 'missing_field_' + field});
    }
  }
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.geo_qa)) {
    throw makeApiError('OPENAI_FORMAT: suggestions missing field geo_qa',
      {...base, error_type: 'format_error', error_code: 'missing_field_geo_qa'});
  }
  return parsed;
}

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

    const outputTokens = request.max_output_tokens ?? TRIAL_TOKEN_CAPS.outputPerRequest;
    if (typeof budget.recordAttempt !== 'function' || typeof budget.updateAttempt !== 'function') {
      throw Error('TRIAL_ATTEMPT_LEDGER_REQUIRED');
    }

    const userContent = JSON.stringify({facts: request.facts, market: request.market, language: request.language});
    const body = {
      model: OPENAI_MODEL.snapshot,
      input: [{role: 'system', content: request.instructions},
              {role: 'user', content: userContent}],
      text: {format: {type: 'json_schema', name: 'seo_geo_suggestions', strict: true, schema: SUGGESTION_SCHEMA}},
      max_output_tokens: outputTokens,
    };
    // The input gate uses the conservative estimate over the exact
    // instructions, user payload, JSON Schema and request envelope
    // being sent; a smaller caller estimate is raised, never trusted.
    const envelopeText = JSON.stringify({
      model: body.model,
      input: body.input.map(({role}) => ({role, content: ''})),
      text: {format: {type: body.text.format.type, name: body.text.format.name, strict: body.text.format.strict}},
      max_output_tokens: body.max_output_tokens,
    });
    const inputTokens = Math.max(
      request.estimated_input_tokens ?? 0,
      estimateInputTokens({
        instructions: request.instructions, userContent,
        schemaText: JSON.stringify(SUGGESTION_SCHEMA), envelopeText}));

    let retried = false;
    for (;;) {
      // Re-run preflight before every send so retries and failures
      // consume the same request cap and budget gate as successes.
      budget.preflight({inputTokens, outputTokens});
      const attempt = budget.recordAttempt({});
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const aborted = new Promise((_, reject) => {
        controller.signal.addEventListener('abort', () => reject(Error('aborted')), {once: true});
      });
      let response;
      try {
        response = await Promise.race([fetchImpl('https://api.openai.com/v1/responses', {
          method: 'POST',
          headers: {authorization: 'Bearer ' + await credentialProvider(), 'content-type': 'application/json'},
          body: JSON.stringify(body),
          signal: controller.signal,
        }), aborted]);
      } catch {
        // A timeout/abort after the request may already be billed by
        // the vendor and the Responses API has no idempotency key, so
        // an automatic retry could double-charge. Never retry here.
        const fields = {outcome: 'UNKNOWN_OUTCOME'};
        budget.updateAttempt(attempt, fields);
        const error = makeApiError(
          'UNKNOWN_OUTCOME: request may have been billed; reconcile before any retry', fields);
        error.usage = {input_tokens: null, output_tokens: null, cost: null,
          usage_reported: false, cost_complete: false};
        throw error;
      } finally {
        clearTimeout(timer);
      }
      if (response.ok) {
        budget.updateAttempt(attempt, {
          http_status: response.status, outcome: 'success',
          request_id: response.headers?.get?.('x-request-id') ?? null,
        });
        const data = await response.json().catch(() => null);
        const usage = data?.usage ?? {};
        // Reconcile reported usage against the gates. Unknown usage is
        // never treated as zero: it is costed at the conservative
        // preflight amounts (estimated input, maximum output).
        const reportedInput = Number.isFinite(usage.input_tokens) ? usage.input_tokens : null;
        const reportedOutput = Number.isFinite(usage.output_tokens) ? usage.output_tokens : null;
        const usageReported = reportedInput != null && reportedOutput != null;
        // The HTTP request succeeded and may be billed, so record its
        // cost before parsing; a parse failure must not erase it.
        const cost = budget.record({
          inputTokens: reportedInput ?? inputTokens,
          outputTokens: reportedOutput ?? outputTokens,
        });
        if (reportedInput != null && reportedInput > (budget.maxInputTokensPerRequest ?? Infinity)) {
          budget.updateAttempt(attempt, {outcome: 'usage_exceeds_input_cap'});
          const error = makeApiError('USAGE_INPUT_CAP_EXCEEDED: reported input usage exceeds gate',
            {http_status: response.status, error_type: 'usage_error', error_code: 'usage_input_cap_exceeded',
              request_id: response.headers?.get?.('x-request-id') ?? data?.id ?? null});
          error.usage = {input_tokens: reportedInput, output_tokens: reportedOutput, cost, usage_reported: usageReported};
          throw error;
        }
        let suggestions;
        try {
          suggestions = parseResponsesSuggestions(data);
        } catch (error) {
          budget.updateAttempt(attempt, {
            ...(error.apiError ?? {}), outcome: 'parse_failed'});
          if (error.apiError && !error.apiError.request_id) {
            budget.updateAttempt(attempt, {
              request_id: response.headers?.get?.('x-request-id') ?? null});
          }
          error.usage = {
            input_tokens: reportedInput, output_tokens: reportedOutput,
            cost, usage_reported: usageReported};
          throw error;
        }
        return {suggestions, usage: {
          input_tokens: reportedInput, output_tokens: reportedOutput,
          cost, usage_reported: usageReported}};
      }
      const errorBody = await response.json().catch(() => ({}));
      const fields = safeApiErrorFields({status: response.status, errorBody, response});
      const kind = classifyApiError({status: response.status, code: fields.error_code});
      if (kind === 'SPEND_LIMIT') {
        budget.updateAttempt(attempt, {...fields, outcome: 'SPEND_LIMIT'});
        budget.stop('vendor spend limit reached: ' + fields.error_code);
        throw makeApiError('VENDOR_SPEND_LIMIT: trial stopped, do not retry', fields);
      }
      if ((kind === 'RATE_LIMIT' || kind === 'SERVER') && !retried) {
        budget.updateAttempt(attempt, {...fields, outcome: 'retrying'});
        retried = true;
        const retryAfter = Number(response.headers?.get?.('retry-after') ?? 1);
        await sleep(Math.min(retryAfter, 30) * 1000);
        continue;
      }
      budget.updateAttempt(attempt, {...fields, outcome: 'failed'});
      throw makeApiError('OPENAI_' + kind + ': HTTP ' + response.status, fields);
    }
  };
}
