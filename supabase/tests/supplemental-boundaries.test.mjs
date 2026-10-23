// Saved HTML verification closes the prior trusted-producer-only boundary.
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createConsoleSourceContext} from '../../apps/web/console-claim-review.mjs';
import {createResultReview} from '../../apps/web/first-result-review.mjs';
import {assertSavedClaims} from '../../apps/web/saved-claim-context.mjs';
const reportFor=count=>JSON.parse(execFileSync('python3',['-B','-c',String.raw`
import sys,json
sys.path.insert(0,'prototype/public-audit')
from first_result_api import build_snapshot
paragraphs=['Public steel product for workshop assembly.','Reusable package for carrying tools.','Store this product in a dry workshop.','Inspect the package before assembly.'][:int(sys.argv[1])]
body=('<html><head><title>Workshop Tool - Shop</title><script type="application/ld+json">{"@type":"Product","name":"Workshop Tool - Shop","offers":{}}</script></head><body><main class="product"><h1>Workshop Tool</h1>'+''.join('<p>'+p+'</p>' for p in paragraphs)+'<button class="add-to-cart">Add</button></main></body></html>').encode()
def fetch(url):
 return (200,{'content-type':'text/plain'},b'User-agent: *\nAllow: /\n') if url.endswith('/robots.txt') else (200,{'content-type':'text/html'},body)
def deny_network(event,args):
 if event.startswith('socket.'): raise RuntimeError('Synthetic supplemental test forbids network')
sys.addaudithook(deny_network)
r=build_snapshot('https://example.invalid/paragraphs',fetch)
assert r.get('extraction',{}).get('method')=='declared_product_dom',r.get('page_type')
print(json.dumps(r))
`,String(count)],{encoding:'utf8'}));
const base=reportFor(4);
const evidence=r=>r.facts.description.citations.filter(id=>!r.facts.product_name.citations.includes(id));
const record=(r,index)=>r.snapshot.citations.find(c=>c.id===evidence(r)[index]);
for(const count of [1,2,3,4])test('legal '+count+' paragraph producer declaration retains all citations',async()=>{
 const r=reportFor(count),before=JSON.stringify(r);assert.equal(evidence(r).length,count);
 const sidecar=createConsoleSourceContext(r);assert.equal(JSON.stringify(r),before);
 assert.deepEqual(sidecar.source_context.find(f=>f.fact_id==='/facts/description').citation_ids,r.facts.description.citations);
 const review=createResultReview(r);for(const k of ['title','meta_description','description'])review.check(k,true);await review.confirm();
 assert.equal((await assertSavedClaims(await review.export())).mapping_status,'PROVEN_EXTRACTIVE_CONTEXT');
});
const negatives={
 'missing aggregate':r=>r.facts.description.citations.splice(0,1),
 'wrong citation order':r=>{const refs=r.facts.description.citations;[refs[1],refs[2]]=[refs[2],refs[1]];},
 'wrong suffix text':r=>{record(r,2).quote='Unrelated workshop paragraph.';},
 'malformed locator':r=>{record(r,1).locator='p[not-a-number]';},
 'duplicate locator':r=>{record(r,1).locator=record(r,0).locator;},
 'decreasing locator':r=>{record(r,2).locator='p[0]';},
 'unsafe integer locator':r=>{record(r,3).locator='p[9007199254740992]';},
 'missing locator':r=>{delete record(r,1).locator;},
 'missing citation record':r=>{const id=evidence(r)[1];r.snapshot.citations=r.snapshot.citations.filter(c=>c.id!==id);},
 'other method microdata':r=>{r.extraction.method='explicit_product_microdata';},
 'other method woocommerce':r=>{r.extraction.method='woocommerce_single_product';},
 'unknown extraction method':r=>{r.extraction.method='unregistered_method';},
 'other field title':r=>{r.facts.title=structuredClone(r.facts.description);},
 'other field use':r=>{r.facts.use=structuredClone(r.facts.description);},
 'other field meta':r=>{r.facts.meta_description=structuredClone(r.facts.description);},
 'other field feature':r=>{r.facts.features=[structuredClone(r.facts.description)];},
};
for(const [name,mutate]of Object.entries(negatives))test(name+' is rejected',()=>{const r=structuredClone(base);mutate(r);assert.throws(()=>createConsoleSourceContext(r));});
test('nonexistent numeric locators are rejected against unchanged saved HTML',()=>{
 const r=structuredClone(base);evidence(r).forEach((id,i)=>{r.snapshot.citations.find(c=>c.id===id).locator='p['+(1000000+i)+']';});
 assert.throws(()=>createConsoleSourceContext(r));assert.equal(r.snapshot.html,base.snapshot.html);
});
test('single full quotation with malformed locator is rejected',()=>{
 const r=reportFor(1);record(r,0).locator='not-a-DOM-locator';assert.throws(()=>createConsoleSourceContext(r));
});
