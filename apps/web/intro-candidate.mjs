// Public-source candidate contract. No network, credentials or persistence.
export const TRIAL='INTRO-TRIAL-01';
export const MODEL='gpt-5.4-mini-2026-03-17';
const fail=code=>{throw Error(code);};
const exact=(v,keys)=>{if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).sort().join('|')!==[...keys].sort().join('|'))fail('INVALID_CANDIDATE');};
const text=(v,max=2000)=>{if(typeof v!=='string'||!v.trim()||v.length>max)fail('INVALID_CANDIDATE');return v;};
export async function digest(v){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(v))))].map(x=>x.toString(16).padStart(2,'0')).join('');}
export function sourceFromReport(report){
 if(report?.page_type!=='static_subpage'||!report.preview||report.preview.source_version!==report.snapshot?.version)fail('SOURCE_NOT_ELIGIBLE');
 const url=text(report.snapshot.final_url,2048),version=text(report.snapshot.version,80);
 if(!/^https:\/\//.test(url)||!/^[a-f0-9]{64}$/.test(version))fail('SOURCE_NOT_ELIGIBLE');
 const fields={};
 for(const key of ['page_name','heading','intro_description','meta_description']){
  const fact=report.facts?.[key];text(fact?.value);
  if(!Array.isArray(fact.citations)||!fact.citations.length)fail('SOURCE_NOT_ELIGIBLE');
  fields[key]=fact.value;
  for(const id of fact.citations){const ref=report.snapshot.citations?.find(r=>r.id===id);if(!ref||ref.source_version!==version||ref.url!==url||ref.quote!==fact.value)fail('SOURCE_NOT_ELIGIBLE');}
 }
 if(report.preview.fields?.description?.original!==fields.intro_description)fail('SOURCE_NOT_ELIGIBLE');
 return {url,version,fields};
}
export function validateSource(source){
 exact(source,['url','version','fields']);text(source.url,2048);
 const url=new URL(source.url);if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)fail('INVALID_SOURCE');
 if(!/^[a-f0-9]{64}$/.test(source.version))fail('INVALID_SOURCE');
 exact(source.fields,['page_name','heading','intro_description','meta_description']);
 for(const value of Object.values(source.fields))text(value);
 return structuredClone(source);
}
export function validateOutput(output,source){
 validateSource(source);exact(output,['candidate','reason','citations']);text(output.candidate);text(output.reason,500);
 if(!Array.isArray(output.citations)||!output.citations.length||output.citations.length>6)fail('INVALID_CITATIONS');
 const seen=new Set();
 for(const ref of output.citations){exact(ref,['field','quote']);text(ref.quote,1000);
  if(!Object.hasOwn(source.fields,ref.field)||!source.fields[ref.field].includes(ref.quote))fail('UNBOUND_CITATION');
  const key=JSON.stringify(ref);if(seen.has(key))fail('DUPLICATE_CITATION');seen.add(key);
 }
 if(!output.citations.some(r=>r.field==='intro_description'))fail('INTRO_CITATION_REQUIRED');
 // Quotation membership is verifiable; semantic entailment remains human review.
 return structuredClone(output);
}
export async function candidateArtifact(source,output,receipt){
 const s=validateSource(source),o=validateOutput(output,s);
 return {schema_version:1,trial:TRIAL,source:s,source_hash:await digest(s),output:o,receipt};
}
export async function validateArtifact(value,source){
 exact(value,['schema_version','trial','source','source_hash','output','receipt']);
 if(value.schema_version!==1||value.trial!==TRIAL)fail('INVALID_CANDIDATE');
 const bound=validateSource(source);
 if(value.source_hash!==await digest(bound)||await digest(validateSource(value.source))!==value.source_hash)fail('STALE_CANDIDATE');
 const output=validateOutput(value.output,bound),r=value.receipt;
 exact(r,['mode','model','response_id','request_id','input_tokens','output_tokens']);
 if(!['live','synthetic'].includes(r.mode)||r.model!==MODEL||!Number.isInteger(r.input_tokens)||r.input_tokens<1||r.input_tokens>4000||!Number.isInteger(r.output_tokens)||r.output_tokens<0||r.output_tokens>1500)fail('INVALID_RECEIPT');
 for(const key of ['response_id','request_id'])if(typeof r[key]!=='string'||!r[key]||r[key].length>200||!/^[a-zA-Z0-9_.:-]+$/.test(r[key]))fail('INVALID_RECEIPT');
 return {output,mode:r.mode,changed:output.candidate!==bound.fields.intro_description};
}
export function difference(before,after){
 text(before);text(after);let start=0,end=0;
 while(start<before.length&&start<after.length&&before[start]===after[start])start++;
 while(end<before.length-start&&end<after.length-start&&before[before.length-1-end]===after[after.length-1-end])end++;
 return {prefix:before.slice(0,start),removed:before.slice(start,before.length-end),added:after.slice(start,after.length-end),suffix:end?before.slice(-end):''};
}
