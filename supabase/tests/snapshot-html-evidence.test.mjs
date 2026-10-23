// Independent saved-HTML checks: producers generate baselines, never expected DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {assertSnapshotHTMLSource} from '../../apps/web/snapshot-html-evidence.mjs';
import {createConsoleSourceContext} from '../../apps/web/console-claim-review.mjs';
import {htmlParserSources} from '../../delivery/growth-console/build-html-parser.mjs';
const reportFor=kind=>JSON.parse(execFileSync('python3',['-B','-c',String.raw`
import sys,json
sys.path.insert(0,'prototype/public-audit')
from first_result_api import build_snapshot
import test_product_source as fixtures
body=getattr(fixtures,sys.argv[1])
def fetch(url):
 return (200,{'content-type':'text/plain'},b'User-agent: *\nAllow: /\n') if url.endswith('/robots.txt') else (200,{'content-type':'text/html'},body)
def deny_network(event,args):
 if event.startswith('socket.'): raise RuntimeError('HTML tests forbid network')
sys.addaudithook(deny_network)
r=build_snapshot('https://example.invalid/tool',fetch)
assert r['page_type']=='product',r
print(json.dumps(r))
`,kind],{encoding:'utf8'}));
const base=reportFor('PRODUCT');
const cite=(r,f='description',index=0)=>r.snapshot.citations.find(c=>c.id===r.facts[f].citations[index]);
for(const kind of ['PRODUCT','MIXED_PRODUCT','WOO_PRODUCT','WOO_MICRO','WOO_MICRO_NO_SHORT'])test(kind+' independently resolves full source facts and ownership',()=>{
 const r=reportFor(kind);const before=structuredClone(r);assert.equal(assertSnapshotHTMLSource(r).scope,'saved_html_consistency_only');assert.ok(createConsoleSourceContext(r));assert.deepEqual(r,before);
});
const negatives={
 'fabricated increasing locator':r=>{cite(r).locator='p[1000000]';},
 'malformed locator':r=>{cite(r).locator='p[1] > script';},
 'in-range wrong tag':r=>{cite(r).locator=r.facts.product_name.citations.map(id=>r.snapshot.citations.find(c=>c.id===id).locator)[0];},
 'different product scope':r=>{r.facts.description.product_scope.locator='section[999]';},
 'different product name locator':r=>{r.facts.description.product_scope.name_locator=cite(r).locator;},
 'different scoped name':r=>{r.facts.description.product_scope.product_name='Other product';},
 'JSON quote and fact fabricated together':r=>{r.facts.description.value='Fabricated steel product description.';cite(r).quote=r.facts.description.value;},
 'saved HTML text differs':r=>{r.snapshot.html=r.snapshot.html.replace('Public steel bolt for workshop assembly.','Other copper bolt for outdoor operation.');},
 'missing saved HTML':r=>{delete r.snapshot.html;},
 'missing description source':r=>{r.snapshot.citations=r.snapshot.citations.filter(c=>c.id!==r.facts.description.citations[0]);},
 'missing feature concealed in JSON':r=>{r.facts.features.pop();},
 'producer method lie':r=>{r.extraction.method='declared_product_dom';},
 'unsupported method':r=>{r.extraction.method='unregistered_method';},
 'hidden description':r=>{r.snapshot.html=r.snapshot.html.replace('<p itemprop="description">','<p hidden itemprop="description">');},
 'nested foreign product paragraph':r=>{r.snapshot.html=r.snapshot.html.replace('<p itemprop="description">','<section itemscope itemtype="https://schema.org/Product"><p itemprop="description">').replace('</p>','</p></section>');},
 'contradictory second product heading':r=>{r.snapshot.html=r.snapshot.html.replace('</main>','<h1>Other Product</h1></main>');},
 'duplicate metadata':r=>{r.snapshot.html=r.snapshot.html.replace('</head>','<meta name="description" content="Other metadata"></head>');},
 'duplicate product identity':r=>{r.snapshot.html=r.snapshot.html.replace('</head>','<script type="application/ld+json">{"@type":"Product","name":"Other product"}</script></head>');},
 'source size limit':r=>{r.snapshot.html=' '.repeat(1048577);},
 'source depth limit':r=>{r.snapshot.html='<div>'.repeat(130)+r.snapshot.html+'</div>'.repeat(130);},
 'omitted explicit source end tag':r=>{r.snapshot.html=r.snapshot.html.replace('</p>','');},
 'foreign namespace':r=>{r.snapshot.html=r.snapshot.html.replace('<main','<svg><main').replace('</main>','</main></svg>');},
};
for(const [name,mutate]of Object.entries(negatives))test(name+' fails independently and at positive-support gate',()=>{
 const r=structuredClone(base);mutate(r);assert.throws(()=>assertSnapshotHTMLSource(r),e=>e.code?.startsWith('HTML_'));assert.throws(()=>createConsoleSourceContext(r));
});
test('same text at another product cannot relocate valid citation',()=>{
 const r=reportFor('MIXED_PRODUCT');const original=cite(r).quote;
 r.snapshot.html=r.snapshot.html.replace('Other drill for professional projects.',original);
 // Existing JSON still resolves the first product; forging the later paragraph is refused.
 const loc=r.snapshot.html.slice(0,r.snapshot.html.indexOf(original,r.snapshot.html.indexOf(original)+original.length)).match(/<[a-zA-Z][^>]*>/g).length;
 cite(r).locator='p['+loc+']';assert.throws(()=>assertSnapshotHTMLSource(r));
});
test('vendor graph exactly matches pinned upstream and every import is local',async()=>{
 const expected=await htmlParserSources();assert.equal(expected.size,17);
 for(const [name,source]of expected){assert.equal(await readFile('apps/web/'+name,'utf8'),source,name);
  for(const match of source.matchAll(/\bfrom\s*['"]([^'"]+)['"]/g)){assert.ok(match[1].startsWith('./source-html-'));assert.ok(expected.has(match[1].slice(2)));}
 }
});
