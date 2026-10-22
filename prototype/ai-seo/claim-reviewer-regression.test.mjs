import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyClaims} from './claim-verifier.mjs';
import {inputFor} from './claim-semantic-cases.mjs';
import {adaptClaimEvidence} from './claim-evidence-adapter.mjs';
for (const [id, yes, no, type] of [
  ['R1-measuring','Orion is measuring 32 cm long.','Orion is not measuring 32 cm long.','numeric'],
  ['R1-with','Orion is made with carbon.','Orion is not made with carbon.','material'],
  ['R3-availability','Orion is available.','Orion is not available.','commercial'],
  ['R3-sale','Orion is on sale.','Orion is not on sale.','commercial']
]) {
  for (const [direction,text,source] of [['negative-claim',no,yes],['negative-source',yes,no]]) {
    test(id+' '+direction,()=>{
      const r=verifyClaims(inputFor({text,source}));
      const c=r.claims.find(c=>c.type===type);
      assert.equal(c?.status,'CONTRADICTED',JSON.stringify(r));
      assert.equal(c.negated,direction==='negative-claim');
      assert.equal(r.decision,'FAIL_CLOSED');
      assert.equal(c.evidence,source);assert.ok(c.fact_id);assert.ok(c.citation_ids.length);
    });
  }
  for (const [polarity,text] of [['positive',yes],['negative',no]]) {
    test(id+' same polarity '+polarity,()=>{
      const r=verifyClaims(inputFor({text,source:text}));
      assert.equal(r.claims.find(c=>c.type===type)?.status,type==='commercial'?'REVIEW':'SUPPORTED',JSON.stringify(r));
      assert.equal(r.decision,type==='commercial'?'PASS_WITH_REVIEW':'PASS');
    });
    test(id+' source conflict '+polarity,()=>{
      const r=verifyClaims(inputFor({text,source:yes+' '+no}));
      assert.equal(r.claims.find(c=>c.type===type)?.status,'SOURCE_CONFLICT',JSON.stringify(r));
      assert.equal(r.decision,'FAIL_CLOSED');
    });
  }
}
for (const [id,source,quote] of [
  ['R2-clipped-negation','Orion is not waterproof.','waterproof'],
  ['R2-clipped-conflict','Orion is waterproof. Orion is not waterproof.','Orion is waterproof.']
]) test(id,()=>{
  const r=adaptClaimEvidence({text:'Orion is waterproof.',evidence:[{fact_id:'description',quote_excerpt:quote,citation_ids:['E1']}],report:{facts:{description:{value:source,citations:['E1'],verification:'source_asserted'}}}});
  assert.equal(r.status,'BLOCKED_INPUT_MAPPING_AMBIGUITY',JSON.stringify(r));
  assert.equal(r.input,null);
});
for(const [id,source,status] of [
  ['R2-full-negation','Orion is not waterproof.','CONTRADICTED'],
  ['R2-full-conflict','Orion is waterproof. Orion is not waterproof.','SOURCE_CONFLICT'],
  ['R2-full-support','Orion is waterproof.','SUPPORTED']
])test(id,()=>{
  const report={facts:{description:{value:source,citations:['E1'],verification:'source_asserted'}}};
  const before=JSON.stringify(report);
  const r=adaptClaimEvidence({text:'Orion is waterproof.',evidence:[{fact_id:'description',quote_excerpt:source,citation_ids:['E1']}],report});
  assert.equal(r.status,'READY');assert.equal(JSON.stringify(report),before);
  const actual=verifyClaims(r.input);
  assert.equal(actual.claims.find(c=>c.type==='performance')?.status,status);
  assert.equal(actual.decision,status==='SUPPORTED'?'PASS':'FAIL_CLOSED');
});
test('R3 missing commercial evidence is unsupported, not contradicted',()=>{
  const r=verifyClaims(inputFor({text:'Orion is available.',source:'Orion is a maple board.'}));
  assert.equal(r.claims.find(c=>c.type==='commercial')?.status,'UNSUPPORTED');
  assert.equal(r.decision,'FAIL_CLOSED');
});
