// WordPress edit-context fields that this adapter never writes. Only an empty,
// unprotected raw excerpt has a content-derived rendering; explicit excerpts
// retain strict rendered comparison. Malformed/missing fields are not defaults.
const types={id:'number',date:'string',date_gmt:'string',slug:'string',status:'string',type:'string',link:'string',author:'number',parent:'number',menu_order:'number',comment_status:'string',ping_status:'string',template:'string',featured_media:'number'};
export function preservedFields(page){
 const out={};
 for(const [key,type]of Object.entries(types)){
  if(typeof page?.[key]!==type||(type==='number'&&!Number.isSafeInteger(page[key])))throw Error('Invalid preserved WordPress field: '+key);
  out[key]=page[key];
 }
 const e=page.excerpt;
 if(!e||Array.isArray(e)||Object.keys(e).sort().join(',')!=='protected,raw,rendered'||typeof e.raw!=='string'||typeof e.rendered!=='string'||typeof e.protected!=='boolean')throw Error('Invalid WordPress excerpt');
 out.excerpt=e.raw===''&&e.protected===false?{raw:e.raw,protected:e.protected}:{...e};
 return out;
}
export function excerptObservation(before,after){
 return {mode:before.excerpt.raw===''&&before.excerpt.protected===false?'empty_raw_derived':'explicit_strict',before:structuredClone(before.excerpt),after:structuredClone(after.excerpt)};
}
