import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createResultReview, contentDigest, reviewFields} from '../../apps/web/first-result-review.mjs';
import {createFirstResultSaveIntent} from './first-result-save-intent.mjs';
const id = n => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function fixture({confirmed = true, title = '使用者微調 🔩 e\u0301', html = '<p>合成產品 Bolt A</p>'} = {}) {
  const bytes = Buffer.from(html), version = hash(bytes), url = 'https://example.com/products/bolt';
  const citation = {id:'s1',snapshot_id:id(1),source_version:version,url,locator:'p[1]',quote:'合成產品 Bolt A'};
  const fact = {kind:'fact',verification:'source_asserted',value:'合成產品 Bolt A',citations:['s1']};
  const source = {snapshot:{schema_version:1,id:id(1),version,original_url:'https://example.com/bolt',final_url:url,fetched_at:'2026-10-03T00:00:00+00:00',encoding:'utf-8-with-replacement',html,content_base64:bytes.toString('base64'),content_fingerprint:'sha256:'+version,citations:[citation],limitations:['Synthetic source only']},facts:{product_name:fact,description:structuredClone(fact),features:[],use:null},inferences:[{kind:'inference',value:'Synthetic product page',basis:'Synthetic type evidence',citations:['s1']}],page_type:'product',extraction:{method:'explicit_product_microdata',limitations:['Synthetic only']},missing:['use','features','specifications','price','certifications','performance','comparisons','guarantees'],preview:{generation:'extractive_rules',source_snapshot_id:id(1),source_version:version,fields:Object.fromEntries(reviewFields.map(key=>[key,{original:' 原文 '+key+' ',suggested:'原建議 '+key,citations:['s1'],reason:'Synthetic reason'}])),pending_confirmation:['price']}};
  for (const key of reviewFields) { source.facts[key] = {...structuredClone(fact),value:' 原文 '+key+' '}; }
  source.facts.description.product_scope={locator:'main[1]',name_locator:'h1[2]',product_name:source.facts.product_name.value};
  source.preview.pending_confirmation=['Confirm source assertions and suitability before applying.',...source.missing];
  const session = createResultReview(source);
  session.edit('title',title);
  if (confirmed) { for(const key of reviewFields) session.check(key,true); await session.confirm(); }
  const report = await session.export();
  const context = {schema_version:1,fixture_only:true,organization_id:id(2),opportunity_id:id(3),request_id:id(4),expected_version:7,role:'owner',opportunity_status:'approved',has_source:true,has_approved_decision:true,mapped_source:{original_url:report.snapshot.original_url,final_url:report.snapshot.final_url,snapshot_id:report.snapshot.id,source_version:report.snapshot.version},expected_review_revision:report.review.revision,expected_content_digest:report.review.content_digest};
  return {report,context};
}
async function check(change, reason, options) {
  const {report,context} = await fixture(options); change(report,context);
  const result = await createFirstResultSaveIntent(report,context);
  assert.equal(result.status,'invalid'); assert.equal(result.reason,reason); assert.equal(result.intent,null);
}
test('candidate preserves exact source, facts, originals, edits and Unicode; no authority or legacy coercion',async()=>{
  const {report,context}=await fixture({title:' '+ '🔩'.repeat(999)+' '});
  const before=structuredClone(report),result=await createFirstResultSaveIntent(report,context);
  assert.equal(result.status,'candidate');const c=result.intent;
  assert.deepEqual(c.report,before);assert.deepEqual(c.fixture_context,context);
  assert.equal(c.report.preview.fields.title.suggested.length,2000);
  assert.equal(c.report.preview.fields.title.citation_role,'reference_only_for_user_edit');
  assert.equal(c.report.review.confirmation.scope,'page_only');
  assert.ok(Object.values(c.authority).every(value=>value===false));assert.equal(c.provenance,'caller_supplied_unverified');
  assert.equal(c.legacy_compatibility.compatible,false);assert.equal(c.legacy_compatibility.reasons.length,2);
  assert.equal(c.source_digest,'sha256:'+hash(Buffer.from(report.snapshot.content_base64,'base64')));
  assert.notEqual(c.source_digest,c.content_digest);assert.notEqual(c.request_digest,c.content_digest);
  assert.throws(()=>{c.report.facts.description.value='overwrite';},TypeError);
  report.snapshot.html='later mutation';context.organization_id=id(99);assert.deepEqual(c.report,before);assert.equal(c.fixture_context.organization_id,id(2));
});
test('missing mapping and unqualified fixture never manufacture eligibility or require a business profile',async()=>{
  const {report,context}=await fixture();assert.equal((await createFirstResultSaveIntent(report)).status,'unmapped');
  for(const change of [c=>delete c.opportunity_id,c=>c.role='viewer',c=>c.role='editor',c=>c.fixture_only=false,c=>c.opportunity_status='candidate',c=>c.has_source=false,c=>c.has_approved_decision=false,c=>c.expected_version=-1,c=>c.expected_version=1.5,c=>c.request_id='',c=>c.organization_id='foreign',c=>c.expected_version=Number.MAX_SAFE_INTEGER]){
    const c=structuredClone(context);change(c);const r=await createFirstResultSaveIntent(report,c);assert.equal(r.status,'ineligible');assert.equal(r.intent,null);
  }
  assert.equal((await createFirstResultSaveIntent(report,context)).status,'candidate');assert.equal('business_profile' in context,false);
});
test('source bytes, HTML, URLs, identity and citation tampering fail closed',async()=>{
  await check(r=>r.snapshot.content_base64=Buffer.from('other').toString('base64'),'SOURCE_HASH_MISMATCH');
  await check(r=>r.snapshot.content_fingerprint='sha256:'+'0'.repeat(64),'SOURCE_HASH_MISMATCH');
  await check(r=>r.snapshot.html+='changed','SOURCE_TEXT_MISMATCH');
  for(const url of ['http://example.com/p','https://user:pass@example.com/p','https://example.com/p?q=1','https://example.com/p#part','https://example.com/white space']) await check(r=>r.snapshot.original_url=url,'INVALID_URL');
  await check(r=>r.preview.source_snapshot_id=id(99),'PREVIEW_BINDING_MISMATCH');
  await check(r=>r.review.source_version='0'.repeat(64),'REVIEW_BINDING_MISMATCH');
  await check(r=>r.review.revision=-1,'REVIEW_BINDING_MISMATCH');
  for(const change of [c=>c.url='https://example.com/foreign',c=>c.source_version='0'.repeat(64),c=>c.snapshot_id=id(99)]) await check(r=>change(r.snapshot.citations[0]),'INVALID_CITATIONS');
  await check(r=>r.snapshot.citations.push(structuredClone(r.snapshot.citations[0])),'INVALID_CITATIONS');
  for(const change of [r=>r.facts.description.citations=['missing'],r=>r.inferences[0].citations=['missing'],r=>r.preview.fields.title.citations=['missing']]) await check(change,'CITATION_REFERENCE_MISMATCH');
  await check(r=>r.facts.description.verification='independently_verified','INVALID_FACTS');
});
test('digests are recomputed; stale page confirmations and forged edit attribution are rejected',async()=>{
  await check(r=>r.review.content_digest='sha256:'+'0'.repeat(64),'CONTENT_DIGEST_MISMATCH');
  await check(r=>r.preview.fields.title.suggested='Altered but still edited','CONTENT_DIGEST_MISMATCH');
  for(const change of [c=>c.owner_approved=true,c=>c.scope='owner_approved',c=>c.revision++,c=>c.snapshot_id=id(99),c=>c.content_digest='old',c=>c.fact_checks.title=false]) await check(r=>change(r.review.confirmation),'STALE_PAGE_CONFIRMATION');
  await check(r=>r.review.fact_checks.description=false,'STALE_PAGE_CONFIRMATION');
  await check(r=>r.review.edited.title=false,'EDIT_ATTRIBUTION_MISMATCH');
  await check(r=>r.preview.fields.title.user_edited=false,'EDIT_ATTRIBUTION_MISMATCH');
  await check(r=>r.preview.fields.title.citation_role='source_support','EDIT_ATTRIBUTION_MISMATCH');
  await check(r=>r.preview.status='awaiting_review','REVIEW_STATUS_MISMATCH');
  await check(r=>r.preview.fields.title.original='Different original','ORIGINAL_FACT_MISMATCH');
  await check(r=>r.preview.published=true,'PREVIEW_BINDING_MISMATCH');
});
test('separate expected mapping rejects source/revision/digest drift; org and request scope remain explicit',async()=>{
  for(const change of [c=>c.mapped_source.snapshot_id=id(99),c=>c.mapped_source.source_version='0'.repeat(64),c=>c.mapped_source.original_url='https://example.com/other',c=>c.mapped_source.final_url='https://example.com/other',c=>c.expected_review_revision++,c=>c.expected_content_digest='old']) await check((r,c)=>change(c),'CONTEXT_BINDING_MISMATCH');
  await check(r=>r.organization_id=id(99),'AMBIGUOUS_WORKSPACE_SCOPE');
  const {report,context}=await fixture(),first=await createFirstResultSaveIntent(report,context);
  for(const key of ['organization_id','opportunity_id','request_id','expected_version']){
    const changed=structuredClone(context);changed[key]=key==='expected_version'?8:id(88);
    const next=await createFirstResultSaveIntent(report,changed);assert.equal(next.status,'candidate');assert.notEqual(next.intent.request_digest,first.intent.request_digest);assert.equal(next.intent.authority.server_authorized,false);
  }
});
test('whole request fingerprint changes with evidence or originals, but does not authenticate caller claims',async()=>{
  const {report,context}=await fixture(),a=await createFirstResultSaveIntent(report,context);
  const reordered=Object.fromEntries(Object.entries(report).reverse());assert.equal((await createFirstResultSaveIntent(reordered,context)).intent.request_digest,a.intent.request_digest);
  for(const change of [r=>{r.facts.description.value='Different caller assertion';r.preview.fields.description.original=r.facts.description.value;},r=>r.snapshot.citations[0].quote='Different caller quote',r=>r.review.original_suggestions.title='Different original suggestion']){
    const changed=structuredClone(report);change(changed);const b=await createFirstResultSaveIntent(changed,context);
    assert.equal(b.status,'candidate');assert.notEqual(b.intent.request_digest,a.intent.request_digest);assert.equal(b.intent.provenance,'caller_supplied_unverified');assert.equal(b.intent.authority.independently_verified,false);
  }
});
test('drafts need no local approval; unknowns preserved; all fields retain existing 1–2000 code-unit bounds',async()=>{
  const {report,context}=await fixture({confirmed:false});const r=await createFirstResultSaveIntent(report,context);
  assert.equal(r.status,'candidate');assert.equal(r.intent.report.review.confirmation,null);assert.deepEqual(r.intent.report.missing,report.missing);
  for(const key of reviewFields)for(const value of ['', '   ', 'x'.repeat(2001), '🔩'.repeat(1001)])await check(r=>r.preview.fields[key].suggested=value,'INVALID_FIELD_SIZE');
  for(const title of ['e\u0301','é','🔩','x'.repeat(160),'x'.repeat(161),'x'.repeat(2000)]){
    const f=await fixture({title});const result=await createFirstResultSaveIntent(f.report,f.context);assert.equal(result.status,'candidate');assert.equal(result.intent.report.preview.fields.title.suggested,title);
  }
  await check(r=>r.preview.fields.title.suggested='\uD800','INVALID_UNICODE');
});
test('non-JSON, malformed sizes and unexpected field layouts are rejected, including cyclic input',async()=>{
  for(const value of [null,undefined,[],NaN]){const {context}=await fixture();assert.equal((await createFirstResultSaveIntent(value,context)).status,'invalid');}
  await check(r=>r.snapshot.content_base64='!bad!','INVALID_SOURCE_BYTES');
  await check(r=>r.snapshot.content_base64='A'.repeat(1398108),'INVALID_SOURCE_BYTES');
  await check(r=>r.preview.fields.extra=r.preview.fields.title,'INVALID_FIELDS');
  await check(r=>r.review.confirmation=undefined,'INVALID_JSON');
  await check(r=>r.loop=r,'INVALID_JSON');
  await check(r=>r.extra='x'.repeat(8*1024*1024),'PAYLOAD_LIMIT');
  await check(r=>{let next=r;for(let i=0;i<30;i++){next.child={};next=next.child;}},'PAYLOAD_LIMIT');
});
test('input snapshots are captured before async hashing; digest matches accepted Review schema exactly',async()=>{
  const {report,context}=await fixture({title:'原文 🧪 e\u0301'}),before=structuredClone(report);
  const pending=createFirstResultSaveIntent(report,context);report.preview.fields.title.suggested='Changed after call';context.request_id=id(99);
  const result=await pending;assert.equal(result.status,'candidate');assert.deepEqual(result.intent.report,before);assert.equal(result.intent.fixture_context.request_id,id(4));
  const fields=Object.fromEntries(reviewFields.map(key=>[key,before.preview.fields[key].suggested]));
  assert.equal(result.intent.content_digest,await contentDigest(JSON.stringify({schema_version:1,...result.intent.fixture_context.mapped_source,revision:before.review.revision,fields})));
});
test('UTF-8 BOM source text and byte hash remain unchanged',async()=>{
  const {report,context}=await fixture({html:'\uFEFF<p>合成</p>'});const result=await createFirstResultSaveIntent(report,context);
  assert.equal(result.status,'candidate');assert.equal(result.intent.report.snapshot.html,report.snapshot.html);
});

test('actual snapshot builder and Review export feed the contract using only injected synthetic HTML',async()=>{
  const raw=JSON.parse(execFileSync('python3',['-B','-c',`
import json, socket
from unittest.mock import patch
from product_source import build_snapshot
from test_product_source import fixture
with patch.object(socket, 'getaddrinfo', side_effect=AssertionError('No DNS allowed')), patch.object(socket, 'create_connection', side_effect=AssertionError('No connection allowed')):
    print(json.dumps(build_snapshot('https://example.com/products/bolt',fixture,lambda:'2026-10-03T00:00:00Z')))
`],{cwd:new URL('.',import.meta.url),encoding:'utf8'}));
  const session=createResultReview(raw);session.edit('description','完整保留的使用者修改 🧪');
  for(const key of reviewFields)session.check(key,true);await session.confirm();
  const report=await session.export(),{context}=await fixture();
  context.mapped_source=session.view().binding;context.expected_review_revision=report.review.revision;context.expected_content_digest=report.review.content_digest;
  const result=await createFirstResultSaveIntent(report,context);
  assert.equal(result.status,'candidate');assert.deepEqual(result.intent.report,report);assert.deepEqual(result.intent.report.snapshot,raw.snapshot);assert.deepEqual(result.intent.report.facts,raw.facts);
});

// P2 regressions: run against 69ce9b1 before changing the validator.
test('producer required evidence cannot be deleted or replaced by untyped values',async()=>{
  const cases=[];
  function required(path,invalid){
    cases.push([path.join('.')+' deleted',r=>{let node=r;for(const key of path.slice(0,-1))node=node[key];delete node[path.at(-1)];}]);
    for(const value of invalid)cases.push([path.join('.')+' = '+JSON.stringify(value),r=>{let node=r;for(const key of path.slice(0,-1))node=node[key];node[path.at(-1)]=value;}]);
  }
  required(['inferences'],[null,{},[],['untyped']]);required(['missing'],[null,{},[],[42],['']]);
  required(['preview','pending_confirmation'],[null,{},[],[42],['']]);
  required(['facts','features'],[null,{},['untyped']]);
  for(const key of ['product_name','title','meta_description','description','use']){
    required(['facts',key],[42,'untyped',[],{kind:'inference',value:'wrong type',citations:['s1']}]);
  }
  for(const key of ['kind','verification','value','citations'])required(['facts','title',key],[null,42]);
  required(['facts','title','kind'],['inference']);required(['facts','title','verification'],['verified']);
  for(const key of ['kind','value','basis','citations'])required(['inferences',0,key],[null,42]);
  required(['inferences',0,'kind'],['fact']);
  required(['page_type'],[null,'not_supported_product']);required(['extraction'],[null,{}]);
  required(['extraction','method'],[null,42]);required(['extraction','limitations'],[null,[],[42]]);
  required(['snapshot','limitations'],[null,[],[42]]);required(['preview','generation'],[null,42]);
  required(['preview','fields','title','reason'],[null,42]);
  required(['facts','description','product_scope'],[null,{}]);
  for(const key of ['locator','name_locator','product_name'])required(['facts','description','product_scope',key],[null,42]);
  cases.push(['typed feature required',r=>r.facts.features=[{kind:'inference',value:'bad',citations:['s1']}]]);
  cases.push(['missing/pending agreement',r=>r.preview.pending_confirmation.pop()]);
  cases.push(['required unknown omitted from both',r=>{r.missing=r.missing.filter(x=>x!=='price');r.preview.pending_confirmation=r.preview.pending_confirmation.filter(x=>x!=='price');}]);
  const accepted=[];
  for(const [name,change] of cases){const {report,context}=await fixture();change(report);const result=await createFirstResultSaveIntent(report,context);if(result.status!=='invalid')accepted.push(name);}
  assert.deepEqual(accepted,[],`Producer schema omissions accepted (${accepted.length}/${cases.length})`);
});
test('builder long supplementary-Unicode original survives a shortened and confirmed current description',async()=>{
  const raw=JSON.parse(execFileSync('python3',['-B','-c',`
import json, socket
from unittest.mock import patch
from product_source import build_snapshot
from test_product_source import PRODUCT, fixture
body=PRODUCT.replace(b'Public steel bolt for workshop assembly.', ('🧪'*1000).encode('utf-8'))
def synthetic(url):
    return fixture(url) if url.endswith('/robots.txt') else (200, {'content-type':'text/html'}, body)
with patch.object(socket, 'getaddrinfo', side_effect=AssertionError('No DNS allowed')), patch.object(socket, 'create_connection', side_effect=AssertionError('No connection allowed')):
    print(json.dumps(build_snapshot('https://example.com/products/bolt',synthetic,lambda:'2026-10-03T00:00:00Z')))
`],{cwd:new URL('.',import.meta.url),encoding:'utf8'}));
  const original=raw.preview.fields.description.suggested;assert.ok(original.length>2000);
  const session=createResultReview(raw);session.edit('description','使用者縮短的產品描述 🧪');
  for(const key of reviewFields)session.check(key,true);await session.confirm();
  const report=await session.export(),{context}=await fixture();context.mapped_source=session.view().binding;context.expected_review_revision=report.review.revision;context.expected_content_digest=report.review.content_digest;
  const result=await createFirstResultSaveIntent(report,context);
  assert.equal(result.status,'candidate',result.reason);
  assert.equal(result.intent.report.review.original_suggestions.description,original);
  assert.equal(result.intent.report.preview.fields.description.suggested,'使用者縮短的產品描述 🧪');
  assert.equal(result.intent.report.preview.fields.description.user_edited,true);
  assert.deepEqual(result.intent.report.snapshot,raw.snapshot);assert.deepEqual(result.intent.report.facts,raw.facts);
});
test('producer WooCommerce null facts and explicit usage/features remain structurally eligible',async()=>{
  const sources=JSON.parse(execFileSync('python3',['-B','-c',`
import json, socket
from unittest.mock import patch
from product_source import build_snapshot
from test_product_source import PRODUCT, WOO_PRODUCT, WOO_MICRO, fixture
bodies=[WOO_PRODUCT, WOO_MICRO, PRODUCT.replace(b'itemprop="description"', b'itemprop="description" data-product-usage="true"')]
with patch.object(socket, 'getaddrinfo', side_effect=AssertionError('No DNS allowed')), patch.object(socket, 'create_connection', side_effect=AssertionError('No connection allowed')):
    print(json.dumps([build_snapshot('https://example.com/products/bolt', lambda url: fixture(url) if url.endswith('/robots.txt') else (200, {'content-type':'text/html'}, body), lambda:'2026-10-03T00:00:00Z') for body in bodies]))
`],{cwd:new URL('.',import.meta.url),encoding:'utf8'}));
  assert.equal(sources[0].facts.meta_description,null);assert.equal(sources[0].facts.use,null);assert.equal(sources[0].facts.features.length,0);
  assert.ok(sources[1].facts.features.length>0);assert.equal(sources[2].facts.use.kind,'fact');
  for(const raw of sources){
    const session=createResultReview(raw),report=await session.export(),{context}=await fixture();
    context.mapped_source=session.view().binding;context.expected_review_revision=report.review.revision;context.expected_content_digest=report.review.content_digest;
    const result=await createFirstResultSaveIntent(report,context);assert.equal(result.status,'candidate',result.reason);assert.deepEqual(result.intent.report,report);
  }
});
