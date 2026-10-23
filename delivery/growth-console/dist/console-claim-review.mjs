// Console-only source-context sidecar. This is NOT model used_fact_ids or an
// addition to the exported report/Review schema. Preserve full source facts.
import {verifyClaims} from './console-claim-engine.mjs';
const fields = ['title', 'meta_description', 'description'];
const copy = value => structuredClone(value);
const length = text => [...text].length;
const slice = (text, n) => [...text].slice(0, n).join('');
const sameSet = (a, b) => Array.isArray(a) && new Set(a).size === a.length
  && a.length === new Set(b).size && a.every(id => b.includes(id));
const adverse = claim => ['CONTRADICTED', 'SOURCE_CONFLICT'].includes(claim.status);
const unknown = reason => ({decision: 'FAIL_CLOSED', mapping_status: 'UNKNOWN', problems: [reason], fields: [], source_context: []});

export function createConsoleSourceContext(report) {
  const fail = reason => {throw Error(reason);};
  const s = report?.snapshot, f = report?.facts, p = report?.preview;
  if (!s?.id || !s.version || !s.html || !s.content_base64 || p?.generation !== 'extractive_rules'
      || p.source_snapshot_id !== s.id || p.source_version !== s.version || !Array.isArray(f?.features)
      || !['explicit_product_microdata', 'woocommerce_single_product', 'declared_product_dom'].includes(report.extraction?.method)) fail('來源上下文版本或抽取方式不明');
  if (report.conflicts && Object.keys(report.conflicts).length) fail('來源有未解衝突');
  const citations = new Map();
  for (const c of s.citations ?? []) {
    if (!c?.id || citations.has(c.id) || c.snapshot_id !== s.id || c.source_version !== s.version
        || c.url !== s.final_url || !c.locator || typeof c.quote !== 'string' || !c.quote) fail('引用缺失或跨來源版本');
    citations.set(c.id, c);
  }
  const context = [];
  function add(path, fact, scoped = false) {
    if (fact === null && !scoped && path !== '/facts/product_name') return;
    if (!fact || fact.kind !== 'fact' || typeof fact.value !== 'string' || !fact.value.trim() || fact.value === 'UNKNOWN'
        || fact.verification !== 'source_asserted' || !Array.isArray(fact.citations) || !fact.citations.length
        || !fact.citations.every(id => citations.has(id))) fail('完整來源原文、引用或查核狀態不明：' + path);
    if (scoped && (!fact.product_scope?.locator || fact.product_scope.name_locator !== citations.get(f.product_name.citations[0])?.locator
        || fact.product_scope.product_name !== f.product_name.value
        || !f.product_name.citations.every(id => fact.citations.includes(id)))) fail('來源混入其他產品：' + path);
    // Every full fact is represented by its original literal quotation(s),
    // plus product-name citations for scoped facts. No snippet-only support.
    if (!fact.citations.some(id => citations.get(id).quote === fact.value)
        || !fact.citations.every(id => citations.get(id).quote === fact.value
          || (scoped && f.product_name.citations.includes(id)))) fail('引用未保留完整事實原文：' + path);
    context.push({fact_id: path, ...copy(fact), citation_ids: [...fact.citations],
      snapshot_id: s.id, source_version: s.version, source_url: s.final_url,
      citation_records: fact.citations.map(id => copy(citations.get(id)))});
  }
  add('/facts/product_name', f.product_name);
  add('/facts/title', f.title);
  add('/facts/meta_description', f.meta_description);
  add('/facts/description', f.description, true);
  f.features.forEach((fact, i) => add('/facts/features/' + i, fact, true));
  add('/facts/use', f.use);

  // Reproduce product_source.preview_for exactly, using Python code-point
  // lengths/slices and its ASCII-space rsplit. Equality proves the producer
  // rule before any declaration is used; citations alone never infer usage.
  const name = f.product_name, description = f.description;
  let meta = description.value;
  if (length(meta) > 160) {meta = slice(meta, 160); if (meta.includes(' ')) meta = meta.slice(0, meta.lastIndexOf(' '));}
  const pieces = [slice(description.value, 1000)], refs = [...description.citations];
  const descriptionIds = ['/facts/product_name', '/facts/description'];
  for (const [i, feature] of f.features.entries()) {
    if (!pieces.includes(feature.value) && !description.value.includes(feature.value)
        && pieces.reduce((n, item) => n + length(item), 0) + length(feature.value) < 1200) {
      pieces.push(feature.value); refs.push(...feature.citations); descriptionIds.push('/facts/features/' + i);
    }
  }
  // Python re.IGNORECASE treats I/i/İ/ı as equivalent for this literal prefix.
  // JS /iu does not. Fold only that finite comparison class, without changing
  // source text, evidence, code-point slicing or the complete-name boundary.
  const prefixCase = text => text.replace(/[Iİı]/g, 'i');
  const escaped = prefixCase(name.value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const alreadyNamed = new RegExp('^' + escaped + '(?=$|[^\\p{L}\\p{N}_])', 'iu').test(prefixCase(description.value));
  const original = {title: name.value, meta_description: meta,
    description: (alreadyNamed ? '' : name.value + '. ') + pieces.join(' ')};
  const declared = {title: ['/facts/product_name'], meta_description: ['/facts/description'], description: descriptionIds};
  const citationSets = {title: name.citations, meta_description: description.citations, description: [...name.citations, ...refs]};
  for (const key of fields) {
    if (p.fields?.[key]?.suggested !== original[key] || !sameSet(p.fields[key].citations, citationSets[key])
        || p.fields[key].original !== (f[key]?.value ?? '')) fail('無法證明原始摘錄規則與完整引用集合：' + key);
  }
  return {kind: 'extractive_source_context_declaration', snapshot_id: s.id, source_version: s.version,
    original_suggestions: original, declared, source_context: context};
}

export function evaluateConsoleClaims({report, fields: current}) {
  let sidecar;
  try {sidecar = createConsoleSourceContext(report);} catch (error) {return unknown(error.message);}
  // The unchanged verifier's direct-map discriminator expects product_name.
  // This null sentinel has no evidence or declared usage. Actual facts retain
  // their complete JSON-pointer IDs, including each feature's original index.
  const map = entries => Object.fromEntries([['product_name', {value: null, verification: 'UNKNOWN', citations: []}],
    ...entries.map(fact => [fact.fact_id, {value: fact.value, citations: fact.citation_ids, verification: fact.verification}])]);
  const full = map(sidecar.source_context);
  // Unresolved contradictions within the retained source cannot be hidden by
  // omitting both conflicting facts from the currently displayed suggestions.
  // This pass only supplies vetoes, never positive support for another field.
  const sourceConflicts = sidecar.source_context.flatMap(fact => verifyClaims({
    suggestions: {source_context: {text: fact.value, used_fact_ids: [fact.fact_id]}}, facts: full,
  }).claims.filter(adverse).map(claim => ({...claim, context_fact_id: fact.fact_id})));
  const results = fields.map(field => {
    const text = current?.[field], ids = sidecar.declared[field];
    const selected = map(sidecar.source_context.filter(fact => ids.includes(fact.fact_id)));
    const suggestions = {[field]: {text, used_fact_ids: ids}};
    const positive = verifyClaims({suggestions, facts: selected});
    const veto = verifyClaims({suggestions, facts: full});
    // Matching extraction order is deterministic for the same field/text.
    // Only adverse full-context results participate; undeclared positive
    // evidence can never convert UNSUPPORTED or REVIEW into support.
    const claims = positive.claims.map((claim, i) => adverse(veto.claims[i]) ? veto.claims[i] : claim);
    const vetoes = veto.claims.filter(adverse);
    const problems = [...positive.problems, ...vetoes.map(claim => field + ': ' + claim.status + ' "' + claim.span + '" (完整來源反證)'),
      ...sourceConflicts.map(claim => field + ': 來源互有衝突 · ' + claim.context_fact_id + ' · "' + claim.span + '"')];
    const decision = problems.length ? 'FAIL_CLOSED' : claims.some(claim => claim.status === 'REVIEW') ? 'PASS_WITH_REVIEW' : 'PASS';
    return {field, text, declared_source_ids: ids, decision, claims, problems};
  });
  return {...sidecar, mapping_status: 'PROVEN_EXTRACTIVE_CONTEXT', source_conflicts: sourceConflicts, fields: results,
    decision: results.some(result => result.decision === 'FAIL_CLOSED') ? 'FAIL_CLOSED'
      : results.some(result => result.decision === 'PASS_WITH_REVIEW') ? 'PASS_WITH_REVIEW' : 'PASS',
    problems: results.flatMap(result => result.problems)};
}
