# Claim prototype evidence rules (offline candidate)

Base: beb8be276783dfbeeb908a9020898e7d0878e881. This changes the isolated prototype only; the product report, frozen manifests, original reviews, holdouts and formal verifySuggestions are unchanged. Independent review is pending.

## Evidence status and workflow are different

- SUPPORTED: a trusted source atom supports the same polarity, attribute and compatible measurement. Preserve fact_id, citation_ids and source text. This is source support, not independent real-world verification.
- UNSUPPORTED: no usable matching evidence. Absence, unrecognized units, unknown verification, different dimensions and unidentified attributes do not prove an opposite fact.
- CONTRADICTED: a traced source atom has opposite polarity, or one identified positive measurement for the same attribute/dimension is incompatible. A negation token alone is never counterevidence.
- SOURCE_CONFLICT: explicitly conflicting source facts, opposing source atoms, or incompatible identified source measurements. Do not select a convenient source and silently PASS. This is an additive prototype status, not a new product report field or frozen contract.
- REVIEW: generic rewrite, ambiguous measurement scope, or source-observed commercial/comparison wording whose relationship, market scope or current validity still needs a human read.
- FAIL_CLOSED: missing/invalid fact usage, unresolved report metadata, unsupported/contradicted/conflicting claims block progression. It is a workflow refusal, not factual falsification. PASS_WITH_REVIEW retains REVIEW claims; PASS concerns only the atoms this bounded extractor recognized. None of these decisions authorizes publishing.

## Bounded extraction and matching

Local polarity stops at sentence/clause punctuation, contrast, and a new coordinated subject/predicate. Bare coordination retains negative scope. Later “without …” does not retroactively negate an earlier measurement. Explicit affirmative measurement predicates can reset prior unrelated negation. Negation and morphology are compared to source polarity; unknown negative claims remain unsupported. Approximation, ranges, comparisons and “not only” measurements require review, and cannot supply exact numeric support.

Length units: inch/in/inches/英吋/英寸/吋/″/", cm/公分/厘米, mm/毫米, m/公尺/米, ft. Conversion uses cm factors and the source's stated decimal precision; other dimensions require identical units. Explicit length/width/thickness/diameter/wheelbase/weight/speed attributes prevent matching different properties. Different numeric values are contradictions only with an identified same attribute; otherwise unsupported. Multiple source measurements are conflicts only beyond their stated rounding tolerance. Attribute-free numeric equality remains a limited prototype heuristic; multi-entity relation resolution is outside this patch.

Cheapest/lowest-price, sale/discounted, availability/stock and listed Chinese equivalents are commercial atoms. No source wording means unsupported; quoted wording still requires scope/freshness review. Comparative clauses are one relation: “less stable than …” does not separately support an affirmative “stable” claim. Exact quoted comparisons still require review. Purpose-list paraphrases retain compatibility only within an affirmative source sentence, never source-wide token matching through negation.

## Optional evidence boundary: no inferred field remapping

adaptClaimEvidence({text, evidence, report}) requires a caller-supplied authoritative report. Each excerpt must exist verbatim in its declared fact_id and its citation_ids must be bound to that same report fact. Only verified/source_asserted facts are eligible. Only selected excerpts are copied; unused fields stay UNKNOWN. It never changes the report or relabels a description excerpt as product_name/meta_description. Missing report, absent/null field, wrong field/citation, UNKNOWN marker or unknown verification returns BLOCKED_INPUT_MAPPING_AMBIGUITY. Explicit source/report conflict returns BLOCKED_SOURCE_CONFLICT.

This resolves the contract exposed by h25/h26 without relabelling their original data: h25-like excerpts assigned to a null metadata field and h26-like description excerpts assigned to a product name cannot be accepted without correct authoritative binding. Those two holdout cases remain unexecuted. Resolving them requires source-authorized clarification, not edited labels. No breaking product schema change is proposed. The adapter is opt-in and not wired into production.

## Limits and verification

This remains a deterministic vocabulary/grammar heuristic, not a general entailment engine. Complex nested negation, ellipsis, multiple entities, relation attachment, unlisted commercial language, and non-length conversions remain risks. REPORT-SHAPED inputs are assertions supplied by the caller, not independently authenticated evidence. Unknown complex language may still escape extraction; PASS is not complete factual certification.

Regression uses new synthetic examples and existing engineering tests unchanged. The exposed ten holdouts are not used to tune expected results or claim independent accuracy. No live model, network generation, database, browser answer store, paid API, deployment, credentials, installation, commit or push is part of this candidate.

## Reviewer corrections R1–R3 (v2)

A with/measuring token never clears predicate negation by itself. Only the existing narrow “not a/an [noun] with a length/width/... of” nominal measurement qualification is retained; independent affirmative clauses use explicit clause boundaries. This remains bounded, not general negation parsing.

The optional excerpt-only adapter now requires quote_excerpt to equal its complete authoritative field value. Partial substrings or selected whole sentences are BLOCKED_INPUT_MAPPING_AMBIGUITY even when citation binding is valid, because omitted same-field context may negate or conflict. It does not import other fields, expand partial excerpts, or mutate the report. This intentionally conservative restriction preserves the original field contract; full-field evidence retains polarity and all same-field conflicts for verification.

Commercial atoms compare source and claim polarity first: both source polarities mean SOURCE_CONFLICT, opposite-only means CONTRADICTED, same-only means freshness/scope REVIEW, and no matching atom means UNSUPPORTED. Freshness review never masks explicit opposite evidence.

## Stock polarity boundary (v3)

Only the already recognized in stock/out of stock phrases share canonical stock. Out of stock carries intrinsic negative polarity; external local not is composed by XOR. Original span and both external_negated/intrinsic_negated remain visible, while negated records effective polarity for this stock atom. Thus not out of stock matches in stock only for REVIEW, never automatic factual support. Opposite effective polarity is traced CONTRADICTED, both source polarities are SOURCE_CONFLICT, and absent source evidence remains UNSUPPORTED. No synonyms or general double-negation parser are added.
