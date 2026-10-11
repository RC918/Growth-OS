// Read-only bridge from the W1 fact/draft/current-review chain to the existing
// publication preview. This module has no publisher, mutation or storage path.
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
const keys=['id','organization_id','name','market','channel','source_url','source_quote','source_version','observed_outdoor','fact_id','fact_version','answer','fact_source_version','fact_source_url','fact_source_quote','fact_market','fact_channel','draft_id','draft_version','body','review_id','review_valid','source_changed','is_conflict'];
const stamp=s=>JSON.stringify(keys.map(k=>s?.[k]));
const frozen=x=>{if(x&&typeof x==='object'){Object.values(x).forEach(frozen);Object.freeze(x);}return x;};
const fail=()=>{throw Error('已保存版本、來源或身份已變更，請讀取最新版本後重新核對');};
export async function prepareW1Publication({version,isCurrent,context,validate,readState,readHistory,readReviews}){
 const session=context();if(session?.role!=='owner'||typeof isCurrent!=='function'||!isCurrent())fail();
 const active=()=>{if(context()!==session||!isCurrent())fail();};
 const expected=stamp(version);await validate();active();const state=await readState();active();
 if(stamp(state)!==expected||state.organization_id!==session.organization_id||!uuid(state.fact_id)||!uuid(state.draft_id)||!Number.isInteger(state.fact_version)||state.fact_version<1||state.draft_version!==state.fact_version||!['yes','no','unknown'].includes(state.answer)||typeof state.review_valid!=='boolean'||typeof state.source_changed!=='boolean'||typeof state.is_conflict!=='boolean')fail();
 const history=await readHistory();active();
 if(!Array.isArray(history)||history.some(d=>d.organization_id!==state.organization_id||d.product_id!==state.id||!uuid(d.id)||!uuid(d.fact_id)||!Number.isInteger(d.version)||d.version<1||d.version>state.draft_version||typeof d.body!=='string')||new Set(history.map(d=>d.id)).size!==history.length||new Set(history.map(d=>d.version)).size!==history.length)fail();
 const draft=history.find(d=>d.id===state.draft_id),previous=history.find(d=>d.version===state.draft_version-1);
 if(!draft||draft.fact_id!==state.fact_id||draft.version!==state.draft_version||draft.source_version!==state.fact_source_version||draft.body!==state.body||typeof state.fact_source_quote!=='string'||typeof state.fact_source_url!=='string'||state.fact_market!==state.market||state.fact_channel!==state.channel)fail();
 if(state.review_valid&&(!uuid(state.review_id)||state.source_changed||state.is_conflict||state.fact_source_version!==state.source_version))fail();
 if(state.review_valid){const reviews=await readReviews(state);active();if(!Array.isArray(reviews)||reviews.length!==1||reviews[0].id!==state.review_id||reviews[0].draft_id!==draft.id||reviews[0].organization_id!==state.organization_id||!uuid(reviews[0].actor))fail();}
 await validate();active();if(stamp(await readState())!==expected)fail();active();
 const blockers=[];const block=(code,message)=>blockers.push({code,message});
 if(state.source_changed||state.fact_source_version!==state.source_version)block('SOURCE_CHANGED','來源已變更；本版依據較舊來源，須先重新核對，舊確認不適用。');
 if(state.is_conflict)block('FACT_CONFLICT','商家答案與來源觀察衝突，須先釐清；本預覽不覆寫答案。');
 if(!state.review_valid)block('REVIEW_REQUIRED','目前這個確切版本尚無有效確認；歷史確認不能代用。');
 block('SYNTHETIC_ONLY','目前是合成示範產品與規則草稿，不能作為真商家內容發布。');
 block('TARGET_UNVERIFIED','來源頁僅供核對；尚未核實實際發布目標頁。');
 block('PLATFORM_UNSELECTED','尚未確定原站可用的發布方式。');
 block('SITE_UNAUTHORIZED','尚未取得目標站與此版本的發布授權；內容確認不是發布授權。');
 block('PUBLICATION_CONFIRMATION_REQUIRED','尚未確認要把這個版本發布到指定頁面；本頁不收取發布授權。');
 block('LIVE_BASELINE_UNKNOWN','網站目前內容與擷取時間未知，不能把來源引文或上一草稿當成現網差異。');
 block('PUBLISH_UNAVAILABLE','本頁只提供發布準備，尚未發布，也沒有發布時間或成效資料。');
 block('PUBLISH_TIME_UNKNOWN','尚無經核實的發布時間，不能開始計算發布後成效。');
 return frozen({status:'preview_only',published:false,can_publish:false,target_url:state.fact_source_url,
  source_version:state.fact_source_version,current_source_version:state.source_version,fetched_at:null,
  binding:{version_number:draft.version,version_id:draft.id,fact_id:state.fact_id,fact_version:state.fact_version,review_id:state.review_valid?state.review_id:null},
  review_status:state.review_valid?'exact_version_confirmed':'review_required',
  fields:{description:{before:state.fact_source_quote,after:draft.body,changed:state.fact_source_quote!==draft.body}},
  previous:previous?{version:previous.version,body:previous.body,changed:previous.body!==draft.body}:null,
  blockers});
}
