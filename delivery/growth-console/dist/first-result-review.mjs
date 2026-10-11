// Page-memory review only. No auth, persistence, network, or publishing authority.
export const reviewFields=Object.freeze(['title','meta_description','description']);
const clone=value=>structuredClone(value);
const fail=code=>{throw Error(code);};
export async function contentDigest(text){
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));
 return 'sha256:'+Array.from(new Uint8Array(bytes),v=>v.toString(16).padStart(2,'0')).join('');
}
export function createResultReview(report,{digest=contentDigest}={}){return buildReview(report,{digest});}
export async function restoreResultReview(report,options={}){
 const source=clone(report);
 const {validateReport}=await import('./first-result-payload.mjs');
 await validateReport(source);
 if(!Number.isSafeInteger(source.review.revision+1))fail('INVALID_REVIEW_REVISION');
 return buildReview(source,{...options,restored:true});
}
function buildReview(report,{digest=contentDigest,restored=false}={}){
 const source=clone(report),s=source?.snapshot,p=source?.preview;
 if(!s?.id||!s.version||!s.original_url||!s.final_url||p?.source_snapshot_id!==s.id||p?.source_version!==s.version||!reviewFields.every(k=>typeof p.fields?.[k]?.suggested==='string'))fail('INVALID_REVIEW_SOURCE');
 const binding={original_url:s.original_url,final_url:s.final_url,snapshot_id:s.id,source_version:s.version};
 const initial=Object.fromEntries(reviewFields.map(k=>[k,p.fields[k].suggested]));
 const original=restored?clone(source.review.original_suggestions):clone(initial);
 let values=clone(initial),checks=Object.fromEntries(reviewFields.map(k=>[k,false])),revision=restored?source.review.revision+1:0,epoch=0,receipt=null,pending=null;
 const valid=()=>reviewFields.every(k=>values[k].trim().length>0&&values[k].length<=2000);
 function invalidate(){epoch++;receipt=null;pending=null;}
 function payload(){return {schema_version:1,...binding,revision,fields:clone(values)};}
 function guard(ticket){if(ticket!==epoch)fail('STALE_REVIEW');}
 function view(){return clone({binding,revision,token:epoch,fields:values,original_suggestions:original,edited:Object.fromEntries(reviewFields.map(k=>[k,values[k]!==original[k]])),fact_checks:checks,valid:valid(),canConfirm:valid()&&reviewFields.every(k=>checks[k]),pending:pending!==null,receipt});}
 return {
  view,
  invalidate,
  edit(key,value){
   if(!reviewFields.includes(key)||typeof value!=='string')fail('INVALID_REVIEW_FIELD');
   invalidate();revision++;values[key]=value;checks[key]=false;return view();
  },
  check(key,value){
   if(!reviewFields.includes(key)||typeof value!=='boolean')fail('INVALID_FACT_CHECK');
   invalidate();checks[key]=value;return view();
  },
  cancel(){invalidate();revision++;values=clone(initial);checks=Object.fromEntries(reviewFields.map(k=>[k,false]));return view();},
  confirm(){
   if(pending)return pending.promise;
   if(!valid())return Promise.reject(Error('INVALID_REVIEW_TEXT'));
   if(!reviewFields.every(k=>checks[k]))return Promise.reject(Error('FACT_CHECK_REQUIRED'));
   if(receipt)return Promise.resolve(view());
   const ticket=epoch,data=payload(),facts=clone(checks),operation={};
   pending=operation;
   operation.promise=Promise.resolve().then(()=>digest(JSON.stringify(data))).then(hash=>{
    guard(ticket);receipt={scope:'page_only',...binding,revision,content_digest:hash,fact_checks:facts};epoch++;
   }).finally(()=>{if(pending===operation)pending=null;}).then(view);
   return operation.promise;
  },
  async export(){
   const ticket=epoch,data=payload(),snapshot=view();
   const hash=await digest(JSON.stringify(data));guard(ticket);
   const output=clone(source);
   for(const key of reviewFields){
    output.preview.fields[key].suggested=snapshot.fields[key];
    output.preview.fields[key].user_edited=snapshot.edited[key];
    output.preview.fields[key].citation_role=snapshot.edited[key]?'reference_only_for_user_edit':'source_support';
   }
   output.preview.status=snapshot.receipt?'locally_confirmed':'awaiting_review';output.preview.published=false;
   output.review={schema_version:1,scope:'page_only',persisted:false,...binding,revision:snapshot.revision,content_digest:hash,original_suggestions:clone(original),edited:snapshot.edited,fact_checks:snapshot.fact_checks,confirmation:snapshot.receipt};
   return output;
  },
 };
}
