// Independent verification against the supplied snapshot HTML, not website truth
// or proof of where the HTML came from. Never executes scripts or fetches URLs.
import {decodeHTML} from './source-html-entities-decode.mjs';
import {Parser} from './source-html-parse5-parser-index.mjs';
const HTML='http://www.w3.org/1999/xhtml';
const blockedTags=new Set(['script','style','noscript','nav','footer','aside','template']);
const excluded=new Set(['related','upsells','cross-sells','recommendations','shipping','shipping-info','delivery']);
const voidTags=new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);
const clean=s=>String(s??'').replace(/[\t\n\v\f\r\x1c-\x1f \u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+/gu,' ').replace(/^ | $/g,'');
const chars=s=>Array.from(s).length;
const fail=code=>{const e=Error('保存的 HTML 無法核對完整引用與產品歸屬；請重新取得來源並核對。');e.code=code;throw e;};
const requireThat=(condition,code)=>{if(!condition)fail(code);};
const attrs=n=>Object.fromEntries((n.attrs??[]).map(a=>[a.name,a.value]));
const classes=n=>new Set((attrs(n).class??'').split(/\s+/u));
const ancestors=n=>{const result=[];for(let p=n.parentNode;p;p=p.parentNode)result.push(p);return result;};
const inside=(node,root)=>node===root||ancestors(node).includes(root);
const blocked=n=>[n,...ancestors(n)].some(p=>blockedTags.has(p.tagName)||'hidden' in attrs(p)||attrs(p)['aria-hidden']==='true');
const scope=n=>[n,...ancestors(n)].find(p=>'itemscope' in attrs(p))??null;
const productScope=n=>scope(n)&&attrs(scope(n)).itemtype?.split(/\s+/u).some(t=>['https://schema.org/Product','http://schema.org/Product'].includes(t))?scope(n):null;
const hasProp=(n,k)=>(attrs(n).itemprop??'').split(/\s+/u).includes(k);
const wooExcluded=n=>[n,...ancestors(n)].some(p=>[...classes(p)].some(c=>excluded.has(c)));
let cachedHTML=null,cached=null;
function parseHTML(html){
 requireThat(typeof html==='string'&&html.length>0&&html.length<=1048576,'HTML_LIMIT');
 if(html===cachedHTML)return cached;
 const tokens=[],errors=[];const offsets=new Set();
 const parser=new Parser({sourceCodeLocationInfo:true,scriptingEnabled:false,onParseError:e=>{if(errors.length<2000)errors.push(e);else fail('HTML_AMBIGUOUS');}});
 const original=parser.onStartTag.bind(parser);
 parser.onStartTag=token=>{
  const offset=token.location?.startOffset;
  if(Number.isSafeInteger(offset)){
   requireThat(!offsets.has(offset)&&tokens.length<20000,'HTML_COMPLEXITY');offsets.add(offset);
   tokens.push({tag:token.tagName,offset});
  }
  original(token);
 };
 // A UTF-8 BOM is an encoding signature, not visible pre-head content.
 parser.tokenizer.write(html.startsWith('\ufeff')?html.slice(1):html,true);
 const nodes=[],byOffset=new Map(),pending=[[parser.document,0]];
 while(pending.length){const [node,depth]=pending.pop();requireThat(depth<=128&&nodes.length<25000,'HTML_COMPLEXITY');
  if(node.tagName){nodes.push(node);const offset=node.sourceCodeLocation?.startTag?.startOffset;if(Number.isSafeInteger(offset)){requireThat(!byOffset.has(offset),'HTML_AMBIGUOUS');byOffset.set(offset,node);}}
  for(const child of [...(node.childNodes??[])].reverse())pending.push([child,depth+1]);
 }
 const locators=new Map(),nodeLocators=new Map();
 tokens.forEach((token,i)=>{const node=byOffset.get(token.offset);if(node&&node.tagName===token.tag&&node.namespaceURI===HTML){const locator=token.tag+'['+(i+1)+']';locators.set(locator,node);nodeLocators.set(node,locator);}});
 const textCache=new WeakMap();
 function text(node){
  if(textCache.has(node))return textCache.get(node);
  const parts=[];const walk=n=>{if(n.nodeName==='#text'){parts.push(n.value);return;}if(n!==node&&blocked(n))return;for(const c of n.childNodes??[])walk(c);};walk(node);
  const value=clean(parts.join(' '));textCache.set(node,value);return value;
 }
 function checked(node){
  requireThat(node&&node.namespaceURI===HTML&&nodeLocators.has(node)&&!blocked(node),'HTML_NODE_MISSING');
  const location=node.sourceCodeLocation;
  requireThat(voidTags.has(node.tagName)||location?.endTag,'HTML_UNSUPPORTED_STRUCTURE');
  requireThat(!errors.some(e=>e.startOffset>=location.startOffset&&e.startOffset<location.startTag.endOffset),'HTML_AMBIGUOUS_NODE');
  return node;
 }
 const locator=node=>{checked(node);return nodeLocators.get(node);};
 const entries=nodes.filter(n=>!blocked(n)&&(['h1','p','li','a'].includes(n.tagName)||hasProp(n,'name'))&&text(n)).sort((a,b)=>a.sourceCodeLocation.endOffset-b.sourceCodeLocation.endOffset||b.sourceCodeLocation.startOffset-a.sourceCodeLocation.startOffset);
 const result={nodes,locators,locator,text,checked,entries};cachedHTML=html;cached=result;return result;
}
function mixed(node){
 const pending=[...(node.childNodes??[])];
 while(pending.length){const child=pending.pop();if(child.tagName&&(blocked(child)||'itemscope' in attrs(child)||child.namespaceURI!==HTML))return true;pending.push(...(child.childNodes??[]));}return false;
}
export function assertSnapshotHTMLSource(report){
 const dom=parseHTML(report?.snapshot?.html),f=report?.facts,s=report?.snapshot;
 requireThat(f&&Array.isArray(f.features)&&Array.isArray(s.citations),'HTML_INVALID_REPORT');
 const {nodes,entries,text,checked,locator}=dom;
 const visible=nodes.filter(n=>!blocked(n));
 const headings=entries.filter(n=>n.tagName==='h1');
 requireThat(headings.length>0&&headings.every(h=>!mixed(h))&&new Set(headings.map(text)).size===1,'HTML_AMBIGUOUS_PRODUCT');
 let heading=checked(headings[0]);const name=text(heading);requireThat(name&&chars(name)<=200&&!wooExcluded(heading),'HTML_PRODUCT_NAME');
 const titles=nodes.filter(n=>n.tagName==='title'&&ancestors(n).some(p=>p.tagName==='head'));
 requireThat(titles.length<=1,'HTML_AMBIGUOUS_TITLE');
 const title=titles.length?text(titles[0]):'';requireThat(chars(title)<=300,'HTML_TITLE_LIMIT');
 const metas=nodes.filter(n=>n.tagName==='meta'&&(attrs(n).name??'').toLowerCase()==='description');
 requireThat(metas.length<=1,'HTML_AMBIGUOUS_META');
 const meta=metas.length?(attrs(metas[0]).content??'').replace(/^[\s\u0085\x1c-\x1f]+|[\s\u0085\x1c-\x1f]+$/gu,''):'';requireThat(chars(meta)<=500,'HTML_META_LIMIT');
 const products=[];let hasOffer=false;const scripts=nodes.filter(n=>n.tagName==='script'&&(attrs(n).type??'').toLowerCase()==='application/ld+json');requireThat(scripts.length<=20,'HTML_SCHEMA_LIMIT');
 for(const script of scripts){
  let data;try{data=JSON.parse((script.childNodes??[]).filter(c=>c.nodeName==='#text').map(c=>c.value).join(''));}catch{fail('HTML_SCHEMA_UNVERIFIABLE');}
  const top=Array.isArray(data)?data:[data];requireThat(top.length<=50,'HTML_SCHEMA_LIMIT');
  for(const node of top){if(!node||typeof node!=='object'||Array.isArray(node))continue;const graph=Array.isArray(node['@graph'])?node['@graph']:[];requireThat(graph.length<50,'HTML_SCHEMA_LIMIT');
   for(const item of [node,...graph]){if(!item||typeof item!=='object')continue;const types=typeof item['@type']==='string'?[item['@type']]:item['@type'];if(Array.isArray(types)&&types.includes('Product')&&typeof item.name==='string'&&clean(item.name)){products.push(clean(item.name));if(item.offers&&typeof item.offers==='object')hasOffer=true;}}
  }
 }
 const og=nodes.filter(n=>n.tagName==='meta'&&(attrs(n).property??'').toLowerCase()==='og:type').map(n=>(attrs(n).content??'').toLowerCase());
 requireThat(og.length<=1,'HTML_AMBIGUOUS_SCHEMA');const ogProduct=['product','og:product'].includes(og[0]);
 let nameRef=[{locator:locator(heading),quote:name}];
 let root=null,description=null,descriptionRefs=[],features=[],use=null,useRefs=[],method=null;
 const micro=productScope(heading);
 if(micro&&hasProp(heading,'name')){
  checked(micro);requireThat(headings.length===1,'HTML_AMBIGUOUS_PRODUCT');
  const names=entries.filter(n=>scope(n)===micro&&hasProp(n,'name'));requireThat(names.length>0&&names.every(n=>!mixed(n)&&text(n)===name),'HTML_PRODUCT_NAME_CONFLICT');
  requireThat(products.every(v=>v===name),'HTML_PRODUCT_DECLARATION');
  const owned=(tag,prop)=>entries.filter(n=>n.tagName===tag&&scope(n)===micro&&hasProp(n,prop));
  const paragraphs=owned('p','description');
  requireThat(paragraphs.every(n=>!mixed(n)&&!wooExcluded(n)&&chars(text(n))<=2000),'HTML_MIXED_SCOPE');
  const descriptions=paragraphs.filter(n=>chars(text(n))>=15);
  requireThat(new Set(descriptions.map(text)).size<=1,'HTML_DESCRIPTION_CONFLICT');
  const items=owned('li','additionalProperty');requireThat(items.length<=8&&items.every(n=>!mixed(n)&&!wooExcluded(n)&&chars(text(n))<=2000),'HTML_FEATURE_SCOPE');
  features=items.map(n=>({value:text(checked(n)),refs:[{locator:locator(n),quote:text(n)},...nameRef],root:micro}));
  if(descriptions.length){root=micro;method='explicit_product_microdata';description=text(descriptions[0]);descriptionRefs=descriptions.map(n=>({locator:locator(n),quote:text(checked(n))}));
   const used=descriptions.filter(n=>'data-product-usage' in attrs(n));requireThat(new Set(used.map(text)).size<=1,'HTML_USE_CONFLICT');if(used.length){use=text(used[0]);useRefs=[{locator:locator(used[0]),quote:use}];}
  }
 }
 let wooVerified=false;
 {
  const wooRoots=visible.filter(n=>n.tagName==='div'&&classes(n).has('product')&&classes(n).has('type-product')&&/^product-\d+$/.test(attrs(n).id??'')&&ancestors(n).some(p=>p.tagName==='main'&&attrs(p).id==='main')&&!wooExcluded(n));
  if(wooRoots.length){
   requireThat(wooRoots.length===1&&headings.length===1,'HTML_AMBIGUOUS_WOO');const candidate=checked(wooRoots[0]),summary=heading.parentNode;
   requireThat(summary?.tagName==='div'&&summary.parentNode===candidate&&classes(summary).has('summary')&&classes(summary).has('entry-summary')&&classes(heading).has('product_title')&&classes(heading).has('entry-title'),'HTML_WOO_OWNERSHIP');
   requireThat(products.every(v=>v===name),'HTML_PRODUCT_DECLARATION');
   const shorts=visible.filter(n=>n.tagName==='div'&&n.parentNode===summary&&classes(n).has('woocommerce-product-details__short-description'));
   const tabs=visible.filter(n=>n.tagName==='div'&&attrs(n).id==='tab-description'&&inside(n,candidate)&&!wooExcluded(n));requireThat(shorts.length<=1&&tabs.length<=1,'HTML_WOO_REGIONS');wooVerified=true;
   const regions=[...shorts,...tabs],values=[],regionRefs=[];
   for(const region of regions){checked(region);const ps=entries.filter(n=>n.tagName==='p'&&inside(n,region));if(!ps.length)continue;requireThat(ps.every(n=>n.parentNode===region&&scope(n)===scope(heading)&&!mixed(n)&&!wooExcluded(n)),'HTML_WOO_PARAGRAPHS');
    const value=clean(ps.map(n=>text(checked(n))).join(' '));requireThat(chars(value)>=15&&chars(value)<=2000,'HTML_DESCRIPTION_LIMIT');values.push(value);regionRefs.push({locator:locator(region),quote:value});
   }
   requireThat(new Set(values).size<=1&&(!description||!values.length||description===values[0]),'HTML_DESCRIPTION_CONFLICT');
   if(!description){requireThat(shorts.length===1&&regionRefs.some(r=>r.locator===locator(shorts[0])),'HTML_WOO_REGIONS');root=candidate;method='woocommerce_single_product';description=values[0];descriptionRefs=regionRefs;}
  }
 }
 if(description&&micro)requireThat(wooVerified||products.length>0||ogProduct,'HTML_PRODUCT_DECLARATION');
 if(!description){
  requireThat(products.length>0||ogProduct,'HTML_PRODUCT_DECLARATION');requireThat(products.every(v=>clean(decodeHTML(v))===name||clean(decodeHTML(v))===title),'HTML_PRODUCT_DECLARATION');
  const roots=headings.map(h=>ancestors(h).find(n=>classes(n).has('product')));requireThat(roots[0]&&roots.every(n=>n===roots[0])&&!wooExcluded(roots[0]),'HTML_DECLARED_SCOPE');root=checked(roots[0]);
  requireThat(hasOffer||visible.some(n=>inside(n,root)&&classes(n).has('add-to-cart')),'HTML_PRODUCT_SUPPORT');
  const clusters=[];
  for(const h of headings){const paragraphs=[];const start=entries.indexOf(h);for(const later of entries.slice(start+1)){
    if(/^h[1-6]$/.test(later.tagName))break;
    if(later.tagName==='p'&&inside(later,root)&&chars(text(later))>=15)paragraphs.push(later);else if(paragraphs.length)break;
   }
   if(paragraphs.length){requireThat(paragraphs.every(n=>!mixed(n)&&!wooExcluded(n)&&scope(n)===scope(h)&&ancestors(n).find(p=>classes(p).has('product'))===root),'HTML_DECLARED_MIXED_SCOPE');const value=clean(paragraphs.map(n=>text(checked(n))).join(' '));requireThat(chars(value)>=15&&chars(value)<=2000,'HTML_DESCRIPTION_LIMIT');clusters.push({value,paragraphs,heading:h});}
  }
  requireThat(clusters.length>0&&new Set(clusters.map(c=>c.value)).size===1,'HTML_DECLARED_CLUSTER');
  const cluster=clusters[0];heading=cluster.heading;nameRef=[{locator:locator(heading),quote:name}];description=cluster.value;method='declared_product_dom';descriptionRefs=[{locator:locator(cluster.paragraphs[0]),quote:description},...cluster.paragraphs.slice(1).map(n=>({locator:locator(n),quote:text(n)}))];features=[];use=null;useRefs=[];
 }
 requireThat(report.extraction?.method===method,'HTML_METHOD_MISMATCH');
 const citations=new Map(s.citations.map(c=>[c.id,c]));
 function fact(actual,value,refs,ownedRoot=null){
  if(!value){requireThat(actual===null,'HTML_UNDECLARED_FACT');return;}
  requireThat(actual?.value===value&&Array.isArray(actual.citations)&&actual.citations.length===refs.length,'HTML_FACT_MISMATCH');
  actual.citations.forEach((id,i)=>{const c=citations.get(id),expected=refs[i];requireThat(c&&c.locator===expected.locator&&c.quote===expected.quote,'HTML_CITATION_MISMATCH');});
  if(ownedRoot)requireThat(actual.product_scope?.locator===locator(ownedRoot)&&actual.product_scope?.name_locator===locator(heading)&&actual.product_scope?.product_name===name,'HTML_SCOPE_MISMATCH');
 }
 fact(f.product_name,name,nameRef);fact(f.title,title,title?[{locator:'title',quote:title}]:[]);fact(f.meta_description,meta,meta?[{locator:'meta[name=description]',quote:meta}]:[]);
 fact(f.description,description,[...descriptionRefs,...nameRef],root);
 requireThat(f.features.length===features.length,'HTML_MISSING_FEATURES');features.forEach((feature,i)=>fact(f.features[i],feature.value,feature.refs,feature.root));
 fact(f.use,use,useRefs);
 return {scope:'saved_html_consistency_only',method};
}
