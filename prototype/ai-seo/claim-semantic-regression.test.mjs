import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyClaims} from './claim-verifier.mjs';
import {adaptClaimEvidence} from './claim-evidence-adapter.mjs';
import {semanticCases, inputFor} from './claim-semantic-cases.mjs';
for (const c of semanticCases) test('synthetic: '+c.id, () => {
  const r=verifyClaims(inputFor(c));
  const claims=r.claims.filter(x=>x.type===(c.type??'numeric'));
  assert.ok(claims.length,JSON.stringify(r));
  assert.ok(claims.every(x=>x.status===c.status),JSON.stringify(r));
  if(c.id.startsWith('comparison'))assert.ok(!r.claims.some(x=>x.type==='performance'&&x.span==='stable'),JSON.stringify(r));
  const decision=['UNSUPPORTED','CONTRADICTED','SOURCE_CONFLICT'].includes(c.status)?'FAIL_CLOSED':c.status==='REVIEW'?'PASS_WITH_REVIEW':'PASS';
  assert.equal(r.decision,decision,JSON.stringify(r));
  for(const x of r.claims.filter(x=>['SUPPORTED','CONTRADICTED'].includes(x.status))) {
    assert.ok(x.fact_id);assert.ok(x.evidence);assert.ok(x.citation_ids.length);
  }
});
const source = {facts:{product_name:{value:'Orion',citations:['name'],verification:'source_asserted'},
  description:{value:'Orion is a maple deck.',citations:['desc'],verification:'source_asserted'},
  meta_description:{value:null,citations:[],verification:'UNKNOWN'}}};
const excerpt={fact_id:'description',quote_excerpt:'Orion is a maple deck.',citation_ids:['desc']};
test('adapter preserves field identity, cited excerpts and source report bytes',()=>{
  const before=JSON.stringify(source);const r=adaptClaimEvidence({text:'Orion is maple.',evidence:[excerpt],report:source});
  assert.equal(r.status,'READY');assert.equal(r.input.facts.facts.description.value,excerpt.quote_excerpt);
  assert.equal(r.input.facts.facts.product_name.value,null);assert.equal(JSON.stringify(source),before);
});
for(const [id,evidence,report] of [
  ['absent-authoritative-report',[excerpt],undefined],
  ['wrong-source-field',[{...excerpt,fact_id:'meta_description'}],source],
  ['wrong-citation',[{...excerpt,citation_ids:['name']}],source],
  ['excerpt-not-in-field',[{...excerpt,quote_excerpt:'Carbon deck.'}],source],
  ['mixed-name-description',[{...excerpt,fact_id:'product_name'}],source],
  ['UNKNOWN-marker',[{...excerpt,quote_excerpt:'UNKNOWN'}],source]
])test('adapter refuses '+id,()=>assert.equal(adaptClaimEvidence({text:'Orion',evidence,report}).status,'BLOCKED_INPUT_MAPPING_AMBIGUITY'));
test('explicit source conflict blocks adaptation without flattening',()=>{
  const report=structuredClone(source);report.facts.description.verification='conflicting';
  assert.equal(adaptClaimEvidence({text:'Orion',evidence:[excerpt],report}).status,'BLOCKED_SOURCE_CONFLICT');
  report.facts.description.verification='source_asserted';report.conflicts=[{field:'description',status:'UNRESOLVED'}];
  assert.equal(adaptClaimEvidence({text:'Orion',evidence:[excerpt],report}).status,'BLOCKED_SOURCE_CONFLICT');
  assert.equal(verifyClaims({suggestions:{description:{text:'Orion maple',used_fact_ids:['description']}},facts:report}).decision,'FAIL_CLOSED');
});
test('UNKNOWN cannot support a generic rewrite and empty requests cannot pass',()=>{
  assert.equal(verifyClaims({suggestions:{description:{text:'An interesting deck',used_fact_ids:['description']}},facts:{facts:{description:{value:'Deck',citations:[],verification:'UNKNOWN'}}}}).decision,'FAIL_CLOSED');
  assert.equal(verifyClaims({suggestions:{},facts:{}}).decision,'FAIL_CLOSED');
});

test('bare coordination preserves negative scope without inventing opposite evidence',()=>{
  const r=verifyClaims(inputFor({text:'Orion is not 32 inch and 24 inch long.',source:'Orion is 32 inch long.'}));
  const numeric=r.claims.filter(c=>c.type==='numeric');
  assert.deepEqual(numeric.map(c=>c.negated),[true,true]);
  assert.deepEqual(numeric.map(c=>c.status),['CONTRADICTED','UNSUPPORTED']);
  assert.equal(r.decision,'FAIL_CLOSED');
});
