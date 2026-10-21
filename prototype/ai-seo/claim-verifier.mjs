// Phase 3B.1 Claim-Based Verification prototype (offline only).
//
// This prototype does NOT replace verifySuggestions and does not
// gate any release path. It exists to be measured against the
// existing verifier (the Baseline) on a fixed, labelled benchmark:
//
//   Claim Extraction -> Evidence Matching -> Decision
//
// Claims are typed (numeric, unit conversion, model code, material,
// performance, specification, purpose, comparison, general rewrite)
// and every supported claim must trace to a Fact ID, its Citation
// IDs and the exact evidence text. A claim with no evidence, with
// evidence only in an UNKNOWN fact, or contradicted by the source
// (negation / opposite / UNRESOLVED conflict) can never auto-PASS.

import {FUNCTION_WORDS, trustedFacts, verifySuggestions} from './ai-seo-pipeline.mjs';

const MATERIAL = new Set(['maple', 'carbon', 'bamboo', 'titanium', 'aluminum', 'aluminium',
  'steel', 'plastic', 'wood', 'wooden', 'leather', 'fiberglass', 'urethane', 'rubber']);
const PERFORMANCE = new Set(['lightweight', 'durable', 'waterproof', 'fast', 'faster', 'fastest',
  'slow', 'slower', 'slowest', 'strong', 'stronger', 'strongest', 'stable', 'stability',
  'speed', 'warranty', 'lifetime', 'premium', 'professional', 'performance']);
const SPEC_NOUN = new Set(['length', 'width', 'weight', 'wheelbase', 'thickness', 'diameter',
  'size', 'dimension', 'dimensions', 'concave', 'ply', 'plies', 'hardness']);
const UNIT_ALIASES = {inch: 'inch', in: 'inch', '"': 'inch', '″': 'inch',
  cm: 'cm', mm: 'mm', m: 'm', km: 'km', kg: 'kg', g: 'g', lb: 'lb', oz: 'oz',
  ft: 'ft', mph: 'mph', kph: 'kph', kmh: 'kph'};
const TO_CM = {inch: 2.54, cm: 1, mm: 0.1, m: 100, ft: 30.48};
const NEGATION = /\b(not|no|never|without|isn't|aren't|doesn't|isnt|arent|doesnt|dont|can't|cant|couldn't|shouldn't|wouldn't|hasn't|haven't|wasn't|weren't|non-)\b|[不未無沒]/i;
const COMPARISON = /\b(more|less|better|worse|than|faster|slower|stronger|larger|smaller|higher|lower)\b|比較|更[快大強輕重]/;

function stem(word) {
  if (word.length > 4 && word.endsWith('ies')) return word.slice(0, -3) + 'y';
  if (word.length > 5 && word.endsWith('ing')) return word.slice(0, -3).replace(/(.)\1$/, '$1');
  if (word.length > 4 && word.endsWith('ed')) return word.slice(0, -2).replace(/(.)\1$/, '$1');
  if (word.length > 3 && word.endsWith('es')) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith('s')) return word.slice(0, -1);
  return word;
}

function latinWords(text) {
  return (text.match(/[A-Za-z][A-Za-z0-9'-]*/g) ?? []).map(w => w.toLowerCase());
}

function sentenceAt(text, index) {
  // The sentence containing the character at `index`; a '.' between
  // digits (40.2) is a decimal point, not a sentence boundary.
  const isBoundary = (i) => {
    const ch = text[i];
    if (ch === '\n' || ch === '!' || ch === '?' || ch === '…') return true;
    if (ch !== '.') return false;
    return !(/\d/.test(text[i - 1] ?? '') && /\d/.test(text[i + 1] ?? ''));
  };
  let start = 0;
  for (let i = (index ?? 0) - 1; i >= 0; i--) if (isBoundary(i)) { start = i + 1; break; }
  let end = text.length;
  for (let i = index ?? 0; i < text.length; i++) if (isBoundary(i)) { end = i; break; }
  return text.slice(start, end);
}

export function extractClaims(rawText, {field = 'description'} = {}) {
  // Typographic variants are the same characters as their ASCII
  // forms for claim purposes, classified by Unicode meaning rather
  // than by enumerating codepoints: NFKC folds fullwidth forms,
  // every apostrophe-like modifier/quote becomes ', every dash or
  // minus sign becomes -, and zero-width/format characters vanish.
  const apostrophes = /[\u0060\u02B9\u02BB\u02BC\u02CA\u02CB\u2018\u2019\u201B\u00B4\u2032\u2033\u2035\u2036\uFF07\uFF40]/g;
  const text = String(rawText)
    .replace(apostrophes, "'")
    .normalize('NFKC')
    .replace(apostrophes, "'")
    .replace(/\p{Pd}|\u2212|\uFE58|\uFE63/gu, '-')
    .replace(/\p{Cf}/gu, '')
    // A modifier letter between two letters is an apostrophe by
    // function (U+02BE, U+02BF, U+A78C, ...), whatever its name.
    .replace(/(?<=\p{L})\p{Lm}(?=\p{L})/gu, "'")
    .replace(/\u00A0/g, ' ')
    // Contraction repair by form, not by codepoint: any single
    // non-letter mark inside an n't-contraction restores the
    // negation, whatever apostrophe-like character was used.
    .replace(/\b(isn|aren|doesn|don|can|couldn|shouldn|wouldn|hasn|haven|wasn|weren)[^\s]?t\b/giu,
      "$1't");
  const claims = [];
  // Negation is judged per claim occurrence, from its own sentence:
  // an affirmative first sentence must not mask a later negation.
  const push = (type, span, detail = {}, index = 0) =>
    claims.push({field, type, span, negated: NEGATION.test(sentenceAt(text, index)), ...detail});
  // Numeric claims, with an optional following unit. Digit runs
  // fused to letters belong to a model code, not a number claim.
  for (const m of text.matchAll(/(\d+(?:[.,]\d+)?)\s*(inch|in|cm|mm|km|kg|mph|kph|ft|oz|lb|m|g|″|")?/g)) {
    const before = text[m.index - 1] ?? '';
    const after = text[(m.index ?? 0) + m[0].length] ?? '';
    if (/[A-Za-z]/.test(before) || /[A-Za-z]/.test(after.replace(/\s/g, '').charAt(0) ?? '')) continue;
    push('numeric', m[0].trim(), {value: Number(m[1].replace(',', '.')), unit: m[2] ? UNIT_ALIASES[m[2]] : null}, m.index);
  }
  // CJK factual markers map to the same claim categories.
  for (const [marker, type] of [['碳纖維', 'material'], ['楓木', 'material'], ['鈦合金', 'material'],
    ['最輕', 'performance'], ['最高時速', 'performance'], ['終身保固', 'performance']]) {
    for (const m of text.matchAll(new RegExp(marker, 'g'))) push(type, marker, {}, m.index);
  }
  // Model / product codes: letters fused with digits.
  for (const m of text.matchAll(/[A-Za-z]+[0-9][A-Za-z0-9-]*/g)) push('model_code', m[0], {}, m.index);
  for (const m of text.matchAll(/[A-Za-z][A-Za-z0-9'-]*/g)) {
    const word = m[0].toLowerCase();
    const base = stem(word.replace(/-.*$/, ''));
    if (MATERIAL.has(word) || MATERIAL.has(base)) push('material', word, {}, m.index);
    else if (PERFORMANCE.has(word) || PERFORMANCE.has(base)) push('performance', word, {}, m.index);
    else if (SPEC_NOUN.has(word) || SPEC_NOUN.has(base)) push('specification', word, {}, m.index);
  }
  for (const m of text.matchAll(/twin-kick|double-kick|[A-Za-z]+-[A-Za-z]+/g)) {
    push('specification', m[0].toLowerCase(), {compound: m[0].toLowerCase()}, m.index);
  }
  // The spaced spellings are the same specification claim as the
  // hyphenated ones, extracted per occurrence so a later negated
  // occurrence is judged on its own sentence.
  for (const m of text.matchAll(/\b(?:twin|double)\s+kick\b/gi)) {
    push('specification', m[0].toLowerCase(),
      {compound: m[0].toLowerCase().replace(/\s+/, '-')}, m.index);
  }
  // Morphological negation: un-/in-/non- forms of claim adjectives
  // (unstable, unsuitable) are negated claims, not new vocabulary.
  for (const m of text.matchAll(/\b(?:un|in|im|il|ir|non)([a-z]{3,})\b/gi)) {
    const base = stem(m[1].toLowerCase());
    if (PERFORMANCE.has(base) || MATERIAL.has(base) || SPEC_NOUN.has(base)
      || ['suitable', 'suit', 'appropriate', 'proper', 'stable', 'safe', 'fit', 'usable'].includes(base)) {
      push('performance', m[0].toLowerCase(), {negated: true, morphological_negation: m[0]}, m.index);
    }
  }
  // Backstop by class, not by word list: an un-/in-/non- prefixed
  // adjective governing a purpose phrase negates that purpose claim
  // ("unsuited / inappropriate / unfit for skateparks"), unless the
  // word is a common non-negative prefix form.
  const NON_NEGATIVE_PREFIX = new Set(['under', 'until', 'unless', 'into', 'inside', 'include',
    'including', 'indeed', 'united', 'unique', 'universal', 'unit', 'units', 'input', 'instead',
    'information', 'industry', 'initial', 'initially', 'instrument', 'internal', 'international']);
  for (const m of text.matchAll(/\b(?:un|in|im|il|ir|non)[a-z]{3,}\s+for\s+[A-Za-z]/gi)) {
    const word = m[0].split(/\s+/)[0].toLowerCase();
    if (NON_NEGATIVE_PREFIX.has(word)) continue;
    push('purpose', m[0], {target: 'for', negated: true, morphological_negation: word}, m.index);
  }
  for (const m of text.matchAll(/\b(?:for|designed for|built for|ideal for)\s+([A-Za-z][A-Za-z -]{2,30})/gi)) {
    push('purpose', m[0], {target: m[1].trim().toLowerCase()}, m.index);
  }
  for (const m of text.matchAll(/適合(.{2,12})/g)) {
    push('purpose', m[0], {target: m[1].trim().toLowerCase()}, m.index);
  }
  if (COMPARISON.test(text)) push('comparison', text.slice(0, 80), {}, 0);
  if (claims.length === 0) push('general_rewrite', text.slice(0, 80), {}, 0);
  return claims;
}

function sourceNumbers(entries) {
  const out = [];
  for (const [factId, fact] of entries) {
    if (!fact.value) continue;
    for (const m of fact.value.matchAll(/(\d+(?:[.,]\d+)?)\s*(inch|in|cm|mm|km|kg|mph|kph|ft|oz|lb|m|g|″|")?/g)) {
      const before = fact.value[m.index - 1] ?? '';
      if (/[A-Za-z]/.test(before)) continue;
      out.push({factId, value: Number(m[1].replace(',', '.')),
        decimals: (m[1].split('.')[1] ?? '').length,
        unit: m[2] ? UNIT_ALIASES[m[2]] : null, evidence: fact.value});
    }
  }
  return out;
}

function factTrace(factId, facts) {
  const fact = facts[factId];
  return fact ? {fact_id: factId, citation_ids: [...(fact.citations ?? [])], evidence: fact.value} : null;
}

function matchClaim(claim, facts, declaredIds) {
  const valued = Object.entries(facts).filter(([, f]) => f.value);
  const conflicting = valued.filter(([, f]) => f.verification === 'conflicting');
  // Only positively trusted facts are evidence: UNKNOWN, conflicting
  // or unrecognised verification states can never support a claim.
  const usable = valued.filter(([, f]) => f.verification === 'source_asserted'
    || f.verification === 'verified');
  if (claim.negated) {
    return {status: 'CONTRADICTED', via: 'negated_claim',
      fact_id: null, citation_ids: [], evidence: null};
  }
  const inFacts = (needle, entries) => {
    for (const [factId, fact] of entries) {
      const words = latinWords(fact.value).map(w => stem(w.replace(/-.*$/, '')));
      const phrases = fact.value.toLowerCase();
      if (words.includes(stem(needle)) || phrases.includes(needle.replace('-', ' '))
        || phrases.includes(needle)) return factTrace(factId, facts);
    }
    return null;
  };

  if (claim.type === 'numeric') {
    for (const source of sourceNumbers(usable)) {
      if (source.unit === claim.unit && source.value === claim.value) {
        return {status: 'SUPPORTED', ...factTrace(source.factId, facts)};
      }
      if (source.unit && claim.unit && source.unit !== claim.unit
        && TO_CM[source.unit] && TO_CM[claim.unit]) {
        // Only rounding equivalence at the source's stated
        // precision counts as the same measurement.
        const converted = (claim.value * TO_CM[claim.unit]) / TO_CM[source.unit];
        const tolerance = 0.5 * 10 ** -(source.decimals ?? 0);
        if (Math.abs(converted - source.value) <= tolerance) {
          return {status: 'SUPPORTED', via: 'unit_conversion', ...factTrace(source.factId, facts)};
        }
      }
      if (!claim.unit && source.value === claim.value) {
        return {status: 'SUPPORTED', ...factTrace(source.factId, facts)};
      }
    }
    return {status: 'UNSUPPORTED', fact_id: null, citation_ids: [], evidence: null};
  }
  if (claim.type === 'general_rewrite') {
    const declared = declaredIds.find(id => facts[id]?.value && facts[id].verification !== 'conflicting');
    if (!declared) return {status: 'UNSUPPORTED', fact_id: null, citation_ids: [], evidence: null};
    // General rewrite copy is never auto-supported on declaration
    // alone: it always needs a human read in shadow mode.
    return {status: 'REVIEW', via: 'general_rewrite_needs_human_read', ...factTrace(declared, facts)};
  }
  if (claim.type === 'purpose' && claim.target) {
    const targetWords = claim.target.split(/[^A-Za-z]+/).filter(w => w.length >= 3 && !FUNCTION_WORDS.has(w));
    if (targetWords.length === 0) {
      // A CJK purpose claim cannot be token-matched; route to review.
      const first = usable[0];
      return first
        ? {status: 'REVIEW', via: 'cjk_purpose_needs_human_read', ...factTrace(first[0], facts)}
        : {status: 'UNSUPPORTED', fact_id: null, citation_ids: [], evidence: null};
    }
    const targetSeq = targetWords.map(w => stem(w));
    for (const [factId, fact] of usable) {
      // The purpose target must occur as an adjacent content-word
      // sequence in the evidence (function words may intervene),
      // not as words scattered across the text.
      const contentSeq = latinWords(fact.value)
        .filter(w => !FUNCTION_WORDS.has(w)).map(w => stem(w.replace(/-.*$/, '')));
      const found = contentSeq.some((_, i) =>
        targetSeq.every((w, j) => contentSeq[i + j] === w));
      if (found) return {status: 'SUPPORTED', ...factTrace(factId, facts)};
    }
    return {status: 'UNSUPPORTED', fact_id: null, citation_ids: [], evidence: null};
  }
  const needle = (claim.compound ?? claim.span).toLowerCase();
  const hit = inFacts(needle, usable);
  if (hit) {
    if (claim.negated) return {status: 'CONTRADICTED', via: 'negated_supported_claim', ...hit};
    return {status: 'SUPPORTED', ...hit};
  }
  const conflictHit = inFacts(needle, conflicting);
  if (conflictHit) return {status: 'CONTRADICTED', via: 'unresolved_conflict', ...conflictHit};
  if (claim.negated) {
    return {status: 'CONTRADICTED', via: 'negation_without_source_basis',
      fact_id: null, citation_ids: [], evidence: null};
  }
  return {status: 'UNSUPPORTED', fact_id: null, citation_ids: [], evidence: null};
}

export function verifyClaims({suggestions, facts: rawFacts}) {
  const facts = rawFacts && rawFacts.product_name && 'value' in rawFacts.product_name
    ? rawFacts : trustedFacts(rawFacts);
  const claims = [];
  const problems = [];
  for (const [field, suggestion] of Object.entries(suggestions ?? {})) {
    if (!suggestion || typeof suggestion.text !== 'string') continue;
    const declared = suggestion.used_fact_ids ?? [];
    for (const id of declared) {
      if (!(id in facts) || !facts[id].value) {
        problems.push(field + ': UNKNOWN fact id ' + id);
      } else if (facts[id].verification === 'conflicting') {
        problems.push(field + ': conflicting fact id ' + id + ' is UNRESOLVED');
      }
    }
    for (const claim of extractClaims(suggestion.text, {field})) {
      const match = matchClaim(claim, facts, declared);
      claims.push({field, ...claim, ...match});
      if (match.status === 'UNSUPPORTED') {
        problems.push(field + ': unsupported ' + claim.type + ' claim "' + claim.span + '"');
      }
      if (match.status === 'CONTRADICTED') {
        problems.push(field + ': contradicted ' + claim.type + ' claim "' + claim.span + '"');
      }
    }
  }
  const decision = problems.length > 0 ? 'FAIL_CLOSED'
    : claims.some(c => c.status === 'REVIEW') ? 'PASS_WITH_REVIEW' : 'PASS';
  return {decision, claims, problems};
}

export function runClaimBenchmark({benchmark, casesById}) {
  const rows = [];
  for (const entry of benchmark.entries) {
    const testCase = casesById[entry.fact_case];
    if (!testCase) throw Error('benchmark references unknown fact case: ' + entry.fact_case);
    const facts = trustedFacts(testCase.report);
    const suggestions = {description: {text: entry.text, used_fact_ids: entry.used_fact_ids}};
    if (testCase.report.conflicts) {
      suggestions.description.used_fact_ids = entry.used_fact_ids;
    }
    const baselineProblems = verifySuggestions(
      {title: {text: 'x', used_fact_ids: ['product_name']},
       meta_description: {text: 'x', used_fact_ids: ['product_name']},
       description: suggestions.description},
      {...facts, ...(testCase.report.conflicts
        ? {description: {...facts.description, verification: 'conflicting'}} : {})})
      .filter(p => p.startsWith('description'));
    const prototype = verifyClaims({suggestions, facts: testCase.report.conflicts
      ? {...facts, description: {...facts.description, verification: 'conflicting'}} : facts});
    const baseline = baselineProblems.length > 0 ? 'FAIL_CLOSED' : 'PASS';
    rows.push({
      id: entry.id, categories: entry.categories, gold: entry.expected_decision,
      baseline, prototype: prototype.decision,
      citation_coverage: prototype.claims.some(c => c.status === 'SUPPORTED')
        ? prototype.claims.filter(c => c.status === 'SUPPORTED')
          .every(c => (c.citation_ids ?? []).length > 0)
        : null,
      claims: prototype.claims,
    });
  }
  const exact = {
    baseline: rows.filter(r => r.baseline === r.gold
      || (r.gold === 'PASS_WITH_REVIEW' && r.baseline === 'PASS')).length,
    prototype: rows.filter(r => r.prototype === r.gold).length,
  };
  const tally = (key) => ({
    false_positive: rows.filter(r => r[key] !== 'FAIL_CLOSED' && r.gold === 'FAIL_CLOSED').length,
    false_negative: rows.filter(r => r[key] === 'FAIL_CLOSED' && r.gold !== 'FAIL_CLOSED').length,
    correct: rows.filter(r => (r[key] === 'FAIL_CLOSED') === (r.gold === 'FAIL_CLOSED')).length,
  });
  const allClaims = rows.flatMap(r => r.claims);
  const supported = allClaims.filter(c => c.status === 'SUPPORTED');
  return {
    rows,
    metrics: {
      entries: rows.length,
      baseline: tally('baseline'),
      prototype: tally('prototype'),
      exact_decision: exact,
      citation_coverage: supported.length === 0 ? 1
        : supported.filter(c => (c.citation_ids ?? []).length > 0).length / supported.length,
      review_rate: allClaims.length === 0 ? 0
        : allClaims.filter(c => c.status === 'REVIEW').length / allClaims.length,
    },
  };
}

export {FUNCTION_WORDS};
