import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyClaims} from './claim-verifier.mjs';
import {inputFor} from './claim-semantic-cases.mjs';
const phrases=['in stock','out of stock','not in stock','not out of stock'];
// Effective absence: out and not-in. Effective presence: in and not-out.
const absent=[false,true,true,false];
for(let i=0;i<phrases.length;i++)for(let j=0;j<phrases.length;j++) {
  test('stock polarity '+phrases[i]+' / '+phrases[j],()=>{
    const text='Orion is '+phrases[i]+'.';
    const source='Orion is '+phrases[j]+'.';
    const r=verifyClaims(inputFor({text,source}));
    const claim=r.claims.find(c=>c.type==='commercial');
    const status=absent[i]===absent[j]?'REVIEW':'CONTRADICTED';
    assert.equal(claim?.status,status,JSON.stringify(r));
    assert.equal(claim.span,phrases[i].replace(/^not /,''));
    assert.equal(r.decision,status==='REVIEW'?'PASS_WITH_REVIEW':'FAIL_CLOSED');
    assert.equal(claim.evidence,source);assert.ok(claim.fact_id);assert.ok(claim.citation_ids.length);
  });
}
for(const phrase of phrases)for(const order of [false,true]) {
  test('stock conflict '+phrase+' reversed='+order,()=>{
    const source=(order?['out of stock','in stock']:['in stock','out of stock'])
      .map(p=>'Orion is '+p+'.').join(' ');
    const r=verifyClaims(inputFor({text:'Orion is '+phrase+'.',source}));
    assert.equal(r.claims.find(c=>c.type==='commercial')?.status,'SOURCE_CONFLICT',JSON.stringify(r));
    assert.equal(r.decision,'FAIL_CLOSED');
  });
}
for(const phrase of phrases)test('stock absent evidence '+phrase,()=>{
  const r=verifyClaims(inputFor({text:'Orion is '+phrase+'.',source:'Orion is a maple deck.'}));
  assert.equal(r.claims.find(c=>c.type==='commercial')?.status,'UNSUPPORTED',JSON.stringify(r));
  assert.equal(r.decision,'FAIL_CLOSED');
});
