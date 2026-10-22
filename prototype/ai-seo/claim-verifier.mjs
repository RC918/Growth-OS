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
// (opposite evidence / UNRESOLVED conflict) can never auto-PASS.
// Claim evidence status is separate from the fail-closed workflow decision.

import {FUNCTION_WORDS, trustedFacts, verifySuggestions} from './ai-seo-pipeline.mjs';

const MATERIAL = new Set(['maple', 'carbon', 'bamboo', 'titanium', 'aluminum', 'aluminium',
  'steel', 'plastic', 'wood', 'wooden', 'leather', 'fiberglass', 'urethane', 'rubber']);
const PERFORMANCE = new Set(['lightweight', 'durable', 'waterproof', 'fast', 'faster', 'fastest',
  'slow', 'slower', 'slowest', 'strong', 'stronger', 'strongest', 'stable', 'stability',
  'speed', 'warranty', 'lifetime', 'premium', 'professional', 'performance']);
const SPEC_NOUN = new Set(['length', 'width', 'weight', 'wheelbase', 'thickness', 'diameter',
  'size', 'dimension', 'dimensions', 'concave', 'ply', 'plies', 'hardness']);
const UNIT_ALIASES = {inches: 'inch', inch: 'inch', in: 'inch', '"': 'inch', '″': 'inch',
  cm: 'cm', mm: 'mm', m: 'm', km: 'km', kg: 'kg', g: 'g', lb: 'lb', oz: 'oz',
  公分: 'cm', 厘米: 'cm', 毫米: 'mm', 公尺: 'm', 米: 'm', 英吋: 'inch', 吋: 'inch', 英寸: 'inch',
  ft: 'ft', mph: 'mph', kph: 'kph', kmh: 'kph'};
const TO_CM = {inch: 2.54, cm: 1, mm: 0.1, m: 100, ft: 30.48};
const NEGATION = /\b(not|no|never|without|isn't|aren't|doesn't|isnt|arent|doesnt|dont|can't|cant|couldn't|shouldn't|wouldn't|hasn't|haven't|wasn't|weren't|non-)\b|[不未無沒]/i;
const NUMBER = /(-?\d+(?:[.,]\d+)?)\s*(inches|inch|in\b|cm|mm|km|kg|mph|kph|ft|oz|lb|m\b|g\b|公分|厘米|毫米|公尺|英吋|英寸|吋|米|″|")?/g;
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

// Bounded clauses: scope never crosses punctuation or a coordinating clause.
// This is a conservative heuristic, not a general natural-language parser.
function clauseRange(text, index) {
  const boundaries = /[;；,，。!?！?\n…]|(?<!\d)\.|\.(?!\d)|\b(?:but|while|whereas)\b|\band\b(?=\s+(?:it|the|this|has|is|measures|measuring|length|width|weighs)\b)|但是|但|而是|而/gi;
  let start = 0, end = text.length;
  for (const m of text.matchAll(boundaries)) {
    if (m.index + m[0].length <= index) start = m.index + m[0].length;
    else if (m.index >= index) { end = m.index; break; }
  }
  return {start, end};
}

function localNegation(text, index) {
  const {start} = clauseRange(text, index);
  // A later "without pushing" does not negate an earlier speed/length.
  const prefix = text.slice(start, index);
  // A preposition/participle inside a negated predicate is not a reset:
  // "not measuring" and "not made with" retain their polarity.
  // Keep the existing narrow nominal-qualification case ("not a toy
  // with a length of ..."); other independent clauses are split above.
  const nominalMeasurement = /\bnot\s+(?:a|an)\s+[A-Za-z-]+\s+with\s+(?:a\s+)?(?:length|width|thickness|diameter|weight)\s+of\s*$/i;
  return !nominalMeasurement.test(prefix) && NEGATION.test(prefix);
}

function measurementAttribute(text, index, spanLength) {
  const {start, end} = clauseRange(text, index);
  const before = text.slice(start, index);
  const after = text.slice(index + spanLength, end);
  const aliases = {length: 'length', long: 'length', 長度: 'length', 長: 'length',
    width: 'width', wide: 'width', 寬度: 'width', 寬: 'width',
    thickness: 'thickness', thick: 'thickness', 厚度: 'thickness', 厚: 'thickness',
    diameter: 'diameter', 直徑: 'diameter', wheelbase: 'wheelbase', 軸距: 'wheelbase',
    weight: 'weight', weighing: 'weight', 重量: 'weight', 重: 'weight', speed: 'speed', 時速: 'speed'};
  const pattern = /\b(length|width|thickness|diameter|wheelbase|weight|weighing|speed)\b|長度|寬度|厚度|直徑|軸距|重量|時速/g;
  const hits = [...before.matchAll(pattern)];
  const suffix = after.match(/^\s*(long|wide|thick|長|寬|厚)(?:\b|(?=[^A-Za-z])|$)/);
  return suffix ? aliases[suffix[1]] : hits.length ? aliases[hits.at(-1)[0]] : null;
}

export function extractClaims(rawText, {field = 'description'} = {}) {
  // Typographic variants are the same characters as their ASCII
  // forms for claim purposes, classified by Unicode meaning rather
  // than by enumerating codepoints: NFKC folds fullwidth forms,
  // every apostrophe-like modifier/quote becomes ', every dash or
  // minus sign becomes -, and zero-width/format characters vanish.
  const apostrophes = /[\u0060\u02B9\u02BB\u02BC\u02CA\u02CB\u2018\u2019\u201B\u00B4\u2032\u2033\u2035\u2036\uFF07\uFF40]/g;
  const text = String(rawText).replace(/(\d)″/g, '$1 inch')
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
  // Each atomic occurrence gets local polarity; negation alone is not evidence.
  const push = (type, span, detail = {}, index = 0) =>
    claims.push({field, type, span, negated: localNegation(text, index), ...detail});
  // Numeric claims, with an optional following unit. Digit runs
  // fused to letters belong to a model code, not a number claim.
  for (const m of text.matchAll(NUMBER)) {
    const before = text[m.index - 1] ?? '';
    const after = text[(m.index ?? 0) + m[0].length] ?? '';
    if (/[A-Za-z]/.test(before) || /[A-Za-z]/.test(after.replace(/\s/g, '').charAt(0) ?? '')) continue;
    const {start, end} = clauseRange(text, m.index);
    const clause = text.slice(start, end);
    const uncertain = COMPARISON.test(clause)
      || /\b(?:about|approximately|at least|at most|between|from|up to|not only|not just)\b|約|至少|至多|不只|不僅|\d\s*[-~～至到]\s*\d/i.test(clause);
    push('numeric', m[0].trim(), {...(uncertain ? {scope_uncertain: true} : {}), value: Number(m[1].replace(',', '.')), unit: m[2] ? UNIT_ALIASES[m[2]] : null,
      decimals: (m[1].split(/[.,]/)[1] ?? '').length,
      attribute: measurementAttribute(text, m.index, m[0].length)}, m.index);
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
    else if (PERFORMANCE.has(word) || PERFORMANCE.has(base)) {
      const {start, end} = clauseRange(text, m.index);
      // 'less stable than' is one comparative claim, not positive stability.
      if (!COMPARISON.test(text.slice(start, end))) push('performance', word, {}, m.index);
    }
    else if (SPEC_NOUN.has(word) || SPEC_NOUN.has(base)) {
      const {start, end} = clauseRange(text, m.index);
      if (!/\d/.test(text.slice(start, end)) || !['length', 'width', 'weight', 'thickness', 'diameter', 'wheelbase'].includes(word)) {
        push('specification', word, {}, m.index);
      }
    }
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
      push('performance', m[0].toLowerCase(), {negated: true, canonical: base, morphological_negation: m[0]}, m.index);
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
  for (const m of text.matchAll(/\b(?:cheapest|lowest[- ]price|on sale|discounted|available(?: now| today)?|in stock|out of stock|currently available)\b|最低價|最便宜|促銷|特價|現貨|目前供應|目前有售/gi)) {
    const stock = /^(?:in stock|out of stock)$/i.test(m[0]);
    const externalNegated = localNegation(text, m.index);
    const intrinsicNegated = m[0].toLowerCase() === 'out of stock';
    push('commercial', m[0], {time_sensitive: true, ...(stock ? {
      canonical: 'stock', external_negated: externalNegated, intrinsic_negated: intrinsicNegated,
      negated: externalNegated !== intrinsicNegated,
    } : {})}, m.index);
  }
  for (const m of text.matchAll(/\b(?:more|less|better|worse|than|faster|slower|stronger|larger|smaller|higher|lower)\b|比較|更[快大強輕重]/gi)) {
    const {start, end} = clauseRange(text, m.index);
    const span = text.slice(start, end).trim();
    if (!claims.some(c => c.type === 'comparison' && c.span === span)) push('comparison', span, {}, m.index);
  }
  if (claims.length === 0) push('general_rewrite', text.slice(0, 80), {}, 0);
  return claims;
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
  const none = (status, via) => ({status, ...(via ? {via} : {}),
    fact_id: null, citation_ids: [], evidence: null});
  if (claim.type === 'general_rewrite') {
    const declared = declaredIds.find(id => usable.some(([factId]) => factId === id));
    return declared
      ? {status: 'REVIEW', via: 'general_rewrite_needs_human_read', ...factTrace(declared, facts)}
      : none(conflicting.length ? 'SOURCE_CONFLICT' : 'UNSUPPORTED');
  }
  // Conflicts are an evidence state, never factual disproof. Do not let
  // a second field launder an unresolved source into positive support.
  if (conflicting.length) return {status: 'SOURCE_CONFLICT', via: 'unresolved_conflict',
    ...factTrace(conflicting[0][0], facts)};
  const sourceClaims = usable.flatMap(([id, fact]) => extractClaims(fact.value)
    .map(c => ({...c, factId: id})));
  if (claim.type === 'commercial') {
    const same = sourceClaims.filter(c => c.type === 'commercial'
      && (c.canonical ?? c.span).toLowerCase() === (claim.canonical ?? claim.span).toLowerCase());
    const hit = same.find(c => c.negated === claim.negated);
    const opposite = same.find(c => c.negated !== claim.negated);
    if (hit && opposite) return {status: 'SOURCE_CONFLICT', via: 'opposing_source_claims', ...factTrace(hit.factId, facts)};
    if (opposite) return {status: 'CONTRADICTED', via: 'opposite_source_polarity', ...factTrace(opposite.factId, facts)};
    return hit ? {status: 'REVIEW', via: 'commercial_scope_or_freshness_unverified', ...factTrace(hit.factId, facts)}
      : none('UNSUPPORTED', 'commercial_scope_or_freshness_unverified');
  }
  if (claim.type === 'comparison') {
    const hit = usable.find(([, f]) => f.value.toLowerCase().includes(claim.span.toLowerCase()));
    return hit ? {status: 'REVIEW', via: 'comparison_relation_needs_human_read', ...factTrace(hit[0], facts)}
      : none('UNSUPPORTED', 'comparison_relation_needs_human_read');
  }
  if (claim.type === 'numeric') {
    if (claim.scope_uncertain) return none('REVIEW', 'measurement_scope_needs_human_read');
    // Only length units convert here. Other dimensions require identical units.
    const comparable = sourceClaims.filter(c => c.type === 'numeric' && !c.scope_uncertain
      && claim.unit && c.unit && (c.unit === claim.unit || (TO_CM[c.unit] && TO_CM[claim.unit]))
      && (!claim.attribute || !c.attribute || claim.attribute === c.attribute));
    const equal = c => {
      if (c.unit === claim.unit) return c.value === claim.value;
      const converted = claim.value * TO_CM[claim.unit] / TO_CM[c.unit];
      const decimals = c.decimals;
      return Math.abs(converted - c.value) <= 0.5 * 10 ** -decimals + Number.EPSILON;
    };
    // Only an explicit shared attribute identifies a differing value as contradiction.
    const known = comparable.filter(c => claim.attribute && c.attribute === claim.attribute && !c.negated);
    if (known.some((c, i) => known.slice(i + 1).some(other =>
      Math.abs(c.value * (TO_CM[c.unit] ?? 1) - other.value * (TO_CM[other.unit] ?? 1))
        > Math.max(0.5 * 10 ** -c.decimals * (TO_CM[c.unit] ?? 1),
          0.5 * 10 ** -other.decimals * (TO_CM[other.unit] ?? 1)) + 1e-9))) {
      return {status: 'SOURCE_CONFLICT', via: 'inconsistent_measurements', ...factTrace(known[0].factId, facts)};
    }
    const opposite = comparable.find(c => equal(c) && c.negated !== claim.negated);
    const hit = comparable.find(c => equal(c) && c.negated === claim.negated);
    if (opposite && hit) return {status: 'SOURCE_CONFLICT', via: 'opposing_source_claims', ...factTrace(hit.factId, facts)};
    if (opposite) return {status: 'CONTRADICTED', via: 'opposite_source_polarity', ...factTrace(opposite.factId, facts)};
    if (hit) return {status: 'SUPPORTED', ...(hit.unit !== claim.unit ? {via: 'unit_conversion'} : {}), ...factTrace(hit.factId, facts)};
    if (!claim.negated && known.length === 1) return {status: 'CONTRADICTED', via: 'incompatible_measurement', ...factTrace(known[0].factId, facts)};
    return none('UNSUPPORTED', 'no_identified_measurement_support');
  }
  // Polarity is compared for the same extracted atom, never inferred from
  // the mere presence of "not" somewhere in an evidence string.
  const atom = c => (c.canonical ?? c.compound ?? c.target ?? c.span).toLowerCase().replace(/\s+/g, '-');
  const same = sourceClaims.filter(c => c.type === claim.type && atom(c) === atom(claim));
  const positive = same.find(c => c.negated === claim.negated);
  const opposite = same.find(c => c.negated !== claim.negated);
  if (positive && opposite) return {status: 'SOURCE_CONFLICT', via: 'opposing_source_claims', ...factTrace(positive.factId, facts)};
  if (opposite) return {status: 'CONTRADICTED', via: 'opposite_source_polarity', ...factTrace(opposite.factId, facts)};
  if (positive) return {status: 'SUPPORTED', ...factTrace(positive.factId, facts)};
  if (claim.negated) return none('UNSUPPORTED', 'no_opposite_source_evidence');
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
    const matched = sourceClaims.filter(c => c.type === 'purpose' && c.target).filter(c => {
      const contentSeq = latinWords(c.target).filter(w => !FUNCTION_WORDS.has(w)).map(stem);
      return contentSeq.some((_, i) => targetSeq.every((w, j) => contentSeq[i + j] === w));
    });
    const hit = matched.find(c => c.negated === claim.negated);
    const opposite = matched.find(c => c.negated !== claim.negated);
    if (hit && opposite) return {status: 'SOURCE_CONFLICT', via: 'opposing_source_claims', ...factTrace(hit.factId, facts)};
    if (opposite) return {status: 'CONTRADICTED', via: 'opposite_source_polarity', ...factTrace(opposite.factId, facts)};
    if (hit) return {status: 'SUPPORTED', ...factTrace(hit.factId, facts)};
    // Preserve affirmative source-list paraphrases, but only within one
    // sentence with no negation. Mixed/negative source context stays unknown.
    for (const [factId, fact] of usable) {
      for (const sentence of fact.value.split(/(?<!\d)\.|\.(?!\d)|[!?。\n]/)) {
        if (NEGATION.test(sentence)) continue;
        const seq = latinWords(sentence).filter(w => !FUNCTION_WORDS.has(w)).map(stem);
        if (seq.some((_, i) => targetSeq.every((w, j) => seq[i + j] === w))) {
          return {status: 'SUPPORTED', ...factTrace(factId, facts)};
        }
      }
    }
    return {status: 'UNSUPPORTED', fact_id: null, citation_ids: [], evidence: null};
  }
  return none('UNSUPPORTED');
}

export function verifyClaims({suggestions, facts: rawFacts}) {
  const facts = rawFacts && rawFacts.product_name && 'value' in rawFacts.product_name
    ? rawFacts : trustedFacts(rawFacts);
  const claims = [];
  const problems = [];
  if (rawFacts?.conflicts && (Array.isArray(rawFacts.conflicts) ? rawFacts.conflicts.length : Object.keys(rawFacts.conflicts).length)) {
    problems.push('source conflict metadata is UNRESOLVED');
  }
  if (!suggestions || !Object.values(suggestions).some(s => typeof s?.text === 'string' && s.text.trim())) {
    problems.push('missing non-empty suggestions');
  }
  for (const [field, suggestion] of Object.entries(suggestions ?? {})) {
    if (!suggestion || typeof suggestion.text !== 'string') continue;
    const declared = Array.isArray(suggestion.used_fact_ids) ? suggestion.used_fact_ids : [];
    if (!declared.length) problems.push(field + ': no declared fact usage');
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
      if (match.status === 'SOURCE_CONFLICT') {
        problems.push(field + ': source conflict for ' + claim.type + ' claim \"' + claim.span + '\"');
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
