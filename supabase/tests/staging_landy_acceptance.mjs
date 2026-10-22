import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
const REF='vhzryhibmpvglzcmfnaa', BASE=`https://${REF}.supabase.co`;
const ORG_A='93a88055-0a0b-40c0-b22f-a6d312320001';
const ORG_B='93a88055-0a0b-40c0-b22f-a6d312320002';
const out = execFileSync('supabase', ['projects','api-keys','--project-ref',REF], {encoding:'utf8'});
const keyFor = n => out.split('\n').find(l=>l.includes(n)).match(/eyJ[A-Za-z0-9._-]+|sb_[A-Za-z0-9._-]+/)[0];
const anonKey=keyFor('anon'), serviceKey=keyFor('service_role');
const svc={apikey:serviceKey,Authorization:`Bearer ${serviceKey}`,'Content-Type':'application/json'};
async function req(path,{method='GET',headers={},body}={}){const r=await fetch(BASE+path,{method,headers,body:body?JSON.stringify(body):undefined});const t=await r.text();let j;try{j=JSON.parse(t)}catch{j=t}return{status:r.status,json:j};}
const results=[]; const check=(n,ok,d='')=>{results.push(!!ok);console.log(`${ok?'PASS':'FAIL'} ${n} ${d}`);};
const payload=JSON.parse(readFileSync(process.env.LANDY_PAYLOAD || '/tmp/landy-payload-reviewed.json','utf8'));
const password='Synthetic-'+randomUUID()+'!aA1';
const users={}; const opportunityId=randomUUID(), requestId=randomUUID();
let versionId=null;
async function makeUser(label,org,role){
  const email=`gos-landy-${label}-${Date.now().toString(36)}@example.test`;
  const u=await req('/auth/v1/admin/users',{method:'POST',headers:svc,body:{email,password,email_confirm:true,user_metadata:{synthetic:true,purpose:'landy-staging-acceptance'}}});
  if(u.status>=300) throw new Error('create '+label+' '+u.status+' '+JSON.stringify(u.json).slice(0,120));
  await req('/rest/v1/organization_members',{method:'POST',headers:{...svc,Prefer:'return=minimal'},body:{organization_id:org,user_id:u.json.id,role}});
  const s=await req('/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:anonKey,'Content-Type':'application/json'},body:{email,password}});
  if(s.status!==200) throw new Error('signin '+label);
  users[label]={id:u.json.id,email,jwt:s.json.access_token};
  return users[label];
}
const auth=u=>({apikey:anonKey,Authorization:`Bearer ${u.jwt}`,'Content-Type':'application/json'});
try{
  const owner=await makeUser('owner',ORG_A,'owner');
  const viewer=await makeUser('viewer',ORG_A,'viewer');
  const foreign=await makeUser('foreign',ORG_B,'owner');
  check('synthetic owner/viewer/foreign sign-in', true);
  const save=await req('/rest/v1/rpc/save_url_result_draft',{method:'POST',headers:auth(owner),body:{p_organization_id:ORG_A,p_opportunity_id:opportunityId,p_request_id:requestId,p_expected_version:0,p_payload:payload}});
  versionId=typeof save.json==='string'?save.json:null;
  check('owner Landy save_url_result_draft (declared_product_dom)', save.status===200 && !!versionId, `status=${save.status} id=${versionId}`);
  const retry=await req('/rest/v1/rpc/save_url_result_draft',{method:'POST',headers:auth(owner),body:{p_organization_id:ORG_A,p_opportunity_id:opportunityId,p_request_id:requestId,p_expected_version:0,p_payload:payload}});
  check('idempotent retry same version', retry.status===200 && retry.json===versionId, `status=${retry.status}`);
  const saved=await req(`/rest/v1/content_versions?id=eq.${versionId}&select=id,first_result_payload,first_result_request_digest`,{headers:auth(owner)});
  const srow=Array.isArray(saved.json)?saved.json[0]:null;
  const rev=await req('/rest/v1/rpc/review_url_result',{method:'POST',headers:auth(owner),body:{p_organization_id:ORG_A,p_version_id:versionId,p_request_id:randomUUID(),p_source_digest:payload.snapshot.content_fingerprint,p_content_digest:payload.review.content_digest,p_version_digest:srow?.first_result_request_digest,p_checks:{title:true,meta_description:true,description:true,source:true,blocking_facts_clear:true}}});
  check('owner review_url_result', rev.status===200, `status=${rev.status} ${JSON.stringify(rev.json).slice(0,100)}`);
  const s2=await req('/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:anonKey,'Content-Type':'application/json'},body:{email:owner.email,password}});
  const owner2={jwt:s2.json.access_token};
  const read=await req(`/rest/v1/content_versions?id=eq.${versionId}&select=id,version_number,title,first_result_payload`,{headers:auth(owner2)});
  const row=Array.isArray(read.json)?read.json[0]:null;
  check('new-session readback same version/source', read.status===200 && !!row && row.version_number===1 && row.first_result_payload?.snapshot?.id===payload.snapshot.id && row.title===payload.preview.fields.title.suggested, `status=${read.status} title=${row?.title}`);
  const rread=await req(`/rest/v1/content_reviews?version_id=eq.${versionId}&select=id,decision`,{headers:auth(owner2)});
  check('new-session review readback (approved)', rread.status===200 && Array.isArray(rread.json) && rread.json.length===1 && rread.json[0].decision==='approved', `rows=${rread.json?.length}`);
  const vwrite=await req('/rest/v1/rpc/save_url_result_draft',{method:'POST',headers:auth(viewer),body:{p_organization_id:ORG_A,p_opportunity_id:randomUUID(),p_request_id:randomUUID(),p_expected_version:0,p_payload:payload}});
  check('viewer write denied', vwrite.status>=400, `status=${vwrite.status}`);
  const fread=await req(`/rest/v1/content_versions?id=eq.${versionId}&select=id`,{headers:auth(foreign)});
  check('foreign tenant read isolated', fread.status===200 && Array.isArray(fread.json) && fread.json.length===0, `rows=${fread.json?.length}`);
  const fwrite=await req('/rest/v1/rpc/save_url_result_draft',{method:'POST',headers:auth(foreign),body:{p_organization_id:ORG_A,p_opportunity_id:randomUUID(),p_request_id:randomUUID(),p_expected_version:0,p_payload:payload}});
  check('foreign tenant write denied', fwrite.status>=400, `status=${fwrite.status}`);
  const evil=JSON.parse(JSON.stringify(payload)); evil.extraction.method='unregistered_method';
  const evilRes=await req('/rest/v1/rpc/save_url_result_draft',{method:'POST',headers:auth(owner),body:{p_organization_id:ORG_A,p_opportunity_id:randomUUID(),p_request_id:randomUUID(),p_expected_version:0,p_payload:evil}});
  check('unregistered method rejected on Staging', evilRes.status>=400, `status=${evilRes.status}`);
  const forged=JSON.parse(JSON.stringify(payload)); forged.snapshot.version='0'.repeat(64);
  const forgedRes=await req('/rest/v1/rpc/save_url_result_draft',{method:'POST',headers:auth(owner),body:{p_organization_id:ORG_A,p_opportunity_id:randomUUID(),p_request_id:randomUUID(),p_expected_version:0,p_payload:forged}});
  check('forged source digest rejected on Staging', forgedRes.status>=400, `status=${forgedRes.status}`);
} finally {
  if(versionId){ await req(`/rest/v1/content_reviews?version_id=eq.${versionId}`,{method:'DELETE',headers:svc}); await req(`/rest/v1/content_versions?id=eq.${versionId}`,{method:'DELETE',headers:svc}); }
  await req(`/rest/v1/growth_opportunities?id=eq.${opportunityId}`,{method:'DELETE',headers:svc});
  for(const k of Object.keys(users)){ await req(`/rest/v1/organization_members?user_id=eq.${users[k].id}`,{method:'DELETE',headers:svc}); await req(`/auth/v1/admin/users/${users[k].id}`,{method:'DELETE',headers:svc}); }
  console.log('CLEANUP_DONE synthetic landy data removed');
}
console.log(results.every(Boolean) ? 'LANDY_STAGING_ACCEPTANCE_PASS' : 'LANDY_STAGING_ACCEPTANCE_FAIL');
process.exit(results.every(Boolean)?0:1);
