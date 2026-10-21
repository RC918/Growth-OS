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

// Factual-token verification, by token class rather than by a flat
// vocabulary match:
//
// - Numbers, units and alphanumeric codes (prices, dimensions, model
//   codes such as BIC00001) are always factual: strict source match.
// - Content words (materials, specifications, performance or product
//   claims) are factual: they must appear in the source, allowing
//   only morphology (plural / -ing / -ed stems) and hyphenation
//   equivalence ("twin kick" in the source covers "twin-kick", and
//   vice versa, only as an adjacent source phrase).
// - Closed-class function words and generic framing verbs (articles,
//   prepositions, auxiliaries, "designed / featuring / includes"
//   style scaffolding) carry no product fact by themselves and are
//   not flagged. This is a linguistic category, not a whitelist of
//   words observed in one failed output: any other unseen content
//   word still fails closed.
// (CJK copy is bounded by the used_fact_ids declaration instead.)
const FUNCTION_WORDS = new Set((
  'the a an and or but if then than so as at by for from in into of off on onto out over per to under up upon via with within without '
  + 'i you he she it we they me him her us them my your his its our their mine yours ours theirs this that these those who whom whose which what when where why how '
  + 'am is are was were be been being do does did doing have has had having can could may might must shall should will would '
  + 'not no nor too very just also only even still already yet more most other others another same such each every any all both few many much own '
  + 'here there now once again further while during before after above below between through against about because until unless although though since despite toward towards among across behind beyond plus except'
).split(' '));
const FRAMING_WORDS = new Set((
  'designed design built build made make features feature featuring includes include including offers offer offering provides provide providing '
  + 'comes come discover explore learn find get see check enjoy introducing introduction overview guide highlights highlight meets meet brings bring helps help'
).split(' '));

function stem(word) {
  if (word.length > 4 && word.endsWith('ies')) return word.slice(0, -3) + 'y';
  if (word.length > 5 && word.endsWith('ing')) return word.slice(0, -3).replace(/(.)\1$/, '$1');
  if (word.length > 4 && word.endsWith('ed')) return word.slice(0, -2).replace(/(.)\1$/, '$1');
  if (word.length > 3 && word.endsWith('es')) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith('s')) return word.slice(0, -1);
  return word;
}

function wordsOf(text) {
  return text.match(/[A-Za-z][A-Za-z0-9'-]*/g) ?? [];
}

function sourceVocabulary(sourceText) {
  const words = wordsOf(sourceText).map(w => w.toLowerCase().replace(/'s$/, ''));
  const singles = new Set();
  for (const word of words) {
    for (const part of word.split('-')) { singles.add(part); singles.add(stem(part)); }
  }
  const phrases = new Set();
  const parts = words.flatMap(w => w.split('-'));
  for (let i = 0; i + 1 < parts.length; i++) phrases.add(parts[i] + '-' + parts[i + 1]);
  for (const word of words) if (word.includes('-')) phrases.add(word);
  const numbers = new Set(
    sourceText.replace(/[A-Za-z][A-Za-z0-9-]{2,}/g, ' ')
      .match(/\d+(?:[.,]\d+)?/g) ?? []);
  return {singles, phrases, numbers};
}

function unverifiableTokens(text, source) {
  const problems = [];
  const numbers = text.replace(/[A-Za-z][A-Za-z0-9-]{2,}/g, ' ')
    .match(/\d+(?:[.,]\d+)?/g) ?? [];
  for (const number of numbers) {
    if (!source.numbers.has(number)) problems.push(number);
  }
  for (const raw of wordsOf(text)) {
    const word = raw.toLowerCase().replace(/'s$/, '');
    if (/\d/.test(word)) { // alphanumeric code / model token
      if (!source.singles.has(word) && !source.phrases.has(word)) problems.push(raw);
      continue;
    }
    if (word.includes('-')) {
      const parts = word.split('-');
      if (source.phrases.has(word)
        || parts.every(p => source.singles.has(p) || source.singles.has(stem(p))
          || FUNCTION_WORDS.has(p) || FRAMING_WORDS.has(p))) continue;
      problems.push(raw);
      continue;
    }
    if (word.length < 3) continue;
    if (source.singles.has(word) || source.singles.has(stem(word))) continue;
    if (FUNCTION_WORDS.has(word) || FRAMING_WORDS.has(word)) continue;
    problems.push(raw);
  }
  return problems;
}

export function verifySuggestions(suggestions, facts) {
  const sourceText = Object.values(facts)
    .map(f => f.value ?? '').join(' ');
  const source = sourceVocabulary(sourceText);
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
      } else if (facts[id].verification === 'conflicting') {
        // An UNRESOLVED conflicting fact may never be cited as the
        // settled basis of a generated claim.
        problems.push(field + ': conflicting fact id ' + id + ' is UNRESOLVED');
      }
    }
    for (const token of unverifiableTokens(suggestion.text, source)) {
      problems.push(field + ': unverifiable factual token "' + token + '"');
    }
  }
  return problems;
}

export function applyUserEdits(result, edits) {
  // Human Review edits are applied only after the same fact
  // verification as AI suggestions; an unverifiable edit fails
  // closed instead of silently becoming the final field.
  if (!result || result.status !== 'AWAITING_REVIEW') {
    throw Error('Only AWAITING_REVIEW results can be edited');
  }
  const fields = structuredClone(result.fields);
  for (const [field, text] of Object.entries(edits ?? {})) {
    if (!FIELDS.includes(field)) throw Error('Unknown field: ' + field);
    if (typeof text !== 'string' || !text) throw Error('Edit must be non-empty text');
    const problems = verifySuggestions(
      {[field]: {text, used_fact_ids: fields[field].used_fact_ids}}, result.facts)
      .filter(p => p.startsWith(field));
    if (problems.length > 0) {
      return {status: 'FAIL_CLOSED', fields: result.fields, problems};
    }
    fields[field].user_edit = text;
    fields[field].final = text;
    fields[field].final_source = 'user_edit';
  }
  for (const field of FIELDS) {
    if (!fields[field].final) {
      fields[field].final = fields[field].ai_suggestion;
      fields[field].final_source = 'ai_suggestion';
    }
  }
  return {status: 'REVIEWED', fields,
    unknown_fields: result.unknown_fields, total_cost: result.total_cost};
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
