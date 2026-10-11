import {createW1Api} from '../../apps/web/w1-workspace-api.mjs';
export const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
export const config={origin:'https://wqepyttadrcnphtyjpjy.supabase.co',key:'sb_publishable_synthetic_only',redirectOrigin:'https://fixture.example.invalid',productId:id(2),accessEnabled:true,writerEnabled:false};
export const fragment='#access_token=isolated-synthetic-not-a-jwt&token_type=bearer&expires_in=3600';
export function createFixture(mode='confirmed'){
 const org=id(1),product=id(2),actor=id(3),calls=[];
 const source={id:product,organization_id:org,name:'合成產品 A',market:'SYNTHETIC',channel:'website',source_url:'https://fixture.example.invalid/product-a',source_quote:'示範來源：未交代戶外適用性。',source_version:1,observed_outdoor:'unknown'};
 const history=[1,2].map(version=>({id:id(50+version),organization_id:org,product_id:product,fact_id:id(40+version),version,source_version:1,body:'合成產品 A：依商家確認，'+(version===1?'支援':'不支援')+'戶外使用。'}));
 const row={...source,fact_id:id(42),fact_version:2,answer:'no',fact_source_version:1,fact_source_url:source.source_url,fact_source_quote:source.source_quote,fact_market:source.market,fact_channel:source.channel,draft_id:id(52),draft_version:2,body:history[1].body,review_id:id(62),review_valid:true,source_changed:false,is_conflict:false};
 const data={row,history,review:{id:id(62),organization_id:org,draft_id:id(52),actor},members:[{organization_id:org,role:'owner'}],user:{id:actor},onRead:async()=>{},fail:false};
 if(mode==='unconfirmed'){row.review_valid=false;row.review_id=null;data.review=null;}
 if(mode==='source-changed'){row.source_version=2;row.source_changed=true;row.review_valid=false;}
 if(mode==='conflict'){row.observed_outdoor='yes';row.is_conflict=true;row.review_valid=false;}
 if(mode==='foreign')row.organization_id=id(999);
 if(mode==='failed')data.fail=true;
 const transport=async(url,options)=>{
  const u=new URL(url);calls.push({path:u.pathname,query:u.search,method:options.method});
  if(options.method!=='GET')throw Error('Fixture forbids all writes');
  await data.onRead(u);
  let result;if(u.pathname==='/auth/v1/user')result=data.user;
  else if(u.pathname==='/rest/v1/r7_members')result=data.members;
  else if(data.fail)return new Response('{}',{status:503});
  else if(u.pathname==='/rest/v1/w1_state')result=[data.row];
  else if(u.pathname==='/rest/v1/w1_drafts')result=data.history;
  else if(u.pathname==='/rest/v1/w1_reviews')result=data.review?[data.review]:[];
  else if(u.pathname==='/rest/v1/rpc/w1_writer_status')result={product_id:product,server_time_ms:Date.now(),expires_at_ms:null,answer_allowed:false,review_allowed:false,answers_remaining:0,reviews_remaining:0};
  else throw Error('Unexpected fixture read: '+u.pathname);
  return new Response(JSON.stringify(result));
 };
 const api=createW1Api(config,{fetchImpl:transport});
 return {api,data,calls,transport,async open(){await api.authenticate(fragment);return this;},run(options={isCurrent:()=>true}){return api.previewUrlPublication(structuredClone(data.row),options);}};
}
