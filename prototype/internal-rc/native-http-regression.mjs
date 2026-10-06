// Explicit short-lived native integration, not persistent RC or a production entrypoint.
import assert from 'node:assert/strict';
import {readFile,writeFile,stat} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {randomBytes,randomUUID,createHmac,createHash} from 'node:crypto';
import {compose} from './deploy/compose.mjs';
import {nativeServiceEnv} from './deploy/native-env.mjs';
import {schema} from './deploy/schema.mjs';
import {ids as fixtureIds,fixtures,parent,request,checks} from '../../supabase/drafts/url_review/fixture.mjs';
const schemaCandidate=process.argv.length===5&&process.argv[4]==='--schema-candidate';
const ids=schemaCandidate?{...fixtureIds,...Object.fromEntries(['owner','viewer','foreign','org','other'].map(k=>[k,randomUUID()]))}:fixtureIds;
if((process.argv.length!==4&&!schemaCandidate)||process.argv[2]!=='--mode'||process.argv[3]!=='growth-os-native-regression')throw Error('Explicit isolated native regression mode required; no services started');
const run='growth-native-http-'+randomUUID(),network=run+'-net',label='growth.native_fixture',names=['db','auth','rest'].map(n=>run+'-'+n),deadline=Date.now()+600000;
const report={candidate:schemaCandidate?'private-site-schema':'original-native-regression',run,started_at:new Date().toISOString(),scope:'ephemeral native Auth/PostgREST HTTP; no WP/persistent RC/email OTP',http:[],checks:{},cleanup:null};
const redactions=new Set();let stage='preflight',authOrigin,restOrigin;const hide=v=>(redactions.add(v),v);
const db=hide(randomBytes(32).toString('hex')),jwt=hide(randomBytes(40).toString('hex')),env=nativeServiceEnv({db,jwt});
const bounded=()=>{if(Date.now()>=deadline)throw Error('Native fixture deadline expired');};
function docker(args,input,environment){try{return execFileSync('docker',args,{input,env:environment?{...process.env,...environment}:process.env,encoding:'utf8',stdio:['pipe','pipe','pipe'],timeout:60000}).trim();}catch(e){let detail=String(e.stderr??'');for(const value of redactions)if(value)detail=detail.replaceAll(value,'[REDACTED]');throw Error('Docker '+args[0]+' failed in '+stage+'; mutation not retried: '+detail.slice(-1200));}}
const sql=body=>docker(['exec','-i','--user','postgres',names[0],'psql','-XAtq','-w','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],body);
const hash=v=>createHash('sha256').update(v).digest('hex');
const protectedPaths=['/workspace/rc-approved-window.json.started','/workspace/rc-approved-window-next.json.started'];
const protectedBefore={};for(const p of protectedPaths)protectedBefore[p]=await readFile(p).then(hash,e=>{if(e.code==='ENOENT')return null;throw e;});
const rootExists=()=>stat('/workspace/growth-internal-rc-01').then(()=>true,e=>{if(e.code==='ENOENT')return false;throw e;});
assert.equal(await rootExists(),false,'persistent RC must be absent');
const images=(await compose()).services;
async function wait(check,message){for(let i=0;i<80;i++){bounded();try{if(await check())return;}catch{}await new Promise(r=>setTimeout(r,250));}throw Error(message);}
function start(service,extra=[]){bounded();const environment=Object.fromEntries(env[service==='db'?'pg':service].trim().split('\n').map(line=>{const i=line.indexOf('=');return [line.slice(0,i),line.slice(i+1)];}));return docker(['run','-d','--rm','--pull=never','--name',run+'-'+service,'--label',label+'='+run,'--network',network,...(service==='db'?['--network-alias','db']:['--read-only','--tmpfs','/tmp']),...extra,...Object.keys(environment).flatMap(key=>['--env',key]),images[service].image],undefined,environment);}
function origin(service,port){const name=run+'-'+service;assert.equal(docker(['inspect','-f','{{index .Config.Labels "'+label+'"}}',name]),run);assert.equal(docker(['inspect','-f','{{json .NetworkSettings.Ports}}',name]),'{}');const ip=docker(['inspect','-f','{{with index .NetworkSettings.Networks "'+network+'"}}{{.IPAddress}}{{end}}',name]);assert.match(ip,/^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.)/);return 'http://'+ip+':'+port;}
async function call(origin,path,{method='GET',token,body,record}={}){
 bounded();assert.ok([authOrigin,restOrigin].includes(origin),'only this run origins');
 const r=await fetch(origin+path,{method,redirect:'error',headers:{...(token?{authorization:'Bearer '+token}:{}),...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(5000)});
 const text=await r.text();let data;try{data=JSON.parse(text);}catch{data=null;}
 if(record)report.http.push({action:record,status:r.status});return {status:r.status,data};
}
function expect(r,status,action){assert.equal(r.status,status,action);return r.data;}
const credentials={};let ownerSession;
async function login(actor){const data=expect(await call(authOrigin,'/token?grant_type=password',{method:'POST',body:credentials[actor],record:'login '+actor}),200,'native password login '+actor);hide(data.access_token);hide(data.refresh_token);assert.equal(data.user.id,ids[actor]);
 const [header,payload,signature]=data.access_token.split('.');assert.equal(JSON.parse(Buffer.from(header,'base64url')).alg,'HS256');const claims=JSON.parse(Buffer.from(payload,'base64url'));
 assert.ok(createHmac('sha256',jwt).update(header+'.'+payload).digest('base64url')===signature,'native signature valid');assert.equal(claims.sub,ids[actor]);assert.equal(claims.role,'authenticated');assert.equal(claims.aud,'authenticated');assert.ok(claims.exp>claims.iat&&claims.exp-claims.iat<=300);
 expect(await call(authOrigin,'/user',{token:data.access_token,record:'native GET user '+actor}),200,'native user validation');report.checks.jwt_source='GoTrue password grant; unmodified returned token accepted by native Auth and PostgREST';report.checks.jwt_algorithm='HS256';report.checks.jwt_audience='authenticated';report.checks.jwt_max_lifetime_seconds=300;return data;}
const rpc=(name,token,body,record)=>call(restOrigin,'/rpc/'+name,{method:'POST',token,body,record});
const snapshot=()=>sql("select jsonb_build_object('versions',(select coalesce(jsonb_agg(to_jsonb(v) order by id),'[]') from content_versions v),'reviews',(select coalesce(jsonb_agg(to_jsonb(r) order by id),'[]') from content_reviews r),'audit',(select coalesce(jsonb_agg(to_jsonb(a) order by id),'[]') from audit_events a));");
try{
 stage='native services';docker(['network','create','--internal','--label',label+'='+run,network]);assert.equal(docker(['network','inspect','-f','{{.Internal}}',network]),'true');
 start('db',['--tmpfs','/var/lib/postgresql/data','--tmpfs','/var/run/postgresql']);
 await wait(()=>{docker(['exec',names[0],'pg_isready','-h','127.0.0.1','-U','postgres']);return true;},'PG readiness failed');
 sql(await readFile(new URL('./deploy/roles.sql',import.meta.url),'utf8'));
 start('auth');authOrigin=origin('auth',9999);
 start('rest');restOrigin=origin('rest',3000);
 await wait(async()=> (await call(authOrigin,'/health')).status===200,'native Auth startup failed');
 sql(await readFile(new URL('./deploy/auth-ready.sql',import.meta.url),'utf8'));
 report.checks.network_internal=true;report.checks.host_ports=0;
 report.checks.native_migrations=Number(sql('select count(*) from auth.schema_migrations;'));assert.equal(report.checks.native_migrations,70);
 report.checks.auth_functions_owner=sql("select pg_get_userbyid(proowner) from pg_proc where oid='auth.uid()'::regprocedure;");assert.equal(report.checks.auth_functions_owner,'supabase_auth_admin');
 report.checks.elevated_application_roles=Number(sql("select count(*) from pg_roles where rolname in ('supabase_auth_admin','authenticator','anon','authenticated','service_role') and (rolsuper or rolcreaterole or rolcreatedb or rolbypassrls);"));assert.equal(report.checks.elevated_application_roles,0);
 stage='native users';const b64=v=>Buffer.from(JSON.stringify(v)).toString('base64url'),unsigned=b64({alg:'HS256',typ:'JWT'})+'.'+b64({role:'service_role',aud:'authenticated',exp:Math.floor(deadline/1000)}),admin=hide(unsigned+'.'+createHmac('sha256',jwt).update(unsigned).digest('base64url'));
 for(const actor of ['owner','viewer','foreign']){credentials[actor]={email:actor+'@rc.example.invalid',password:hide(randomBytes(32).toString('hex'))};const u=expect(await call(authOrigin,'/admin/users',{method:'POST',token:admin,body:{id:ids[actor],...credentials[actor],email_confirm:true},record:'native admin create '+actor}),200,'create '+actor);assert.equal(u.id,ids[actor]);}
 report.checks.native_users=Number(sql('select count(*) from auth.users;'));assert.equal(report.checks.native_users,3);
 ownerSession=await login('owner');
 await wait(async()=> (await call(restOrigin,'/')).status===200,'PostgREST startup failed');
 expect(await call(restOrigin,'/content_versions?select=id',{token:ownerSession.access_token,record:'schema before reload'}),404,'business schema initially absent');
 stage='business schema';
 if(schemaCandidate){const candidate=await import('../private-site/schema/native-checks.mjs');report.checks.schema_candidate=await candidate.installAndCheck({sql,ids});}
 else{const business=await schema();assert.equal(business,await readFile(new URL('./deploy/schema.candidate.sql',import.meta.url),'utf8'));sql(business);}
 await wait(async()=> (await call(restOrigin,'/content_versions?select=id',{token:ownerSession.access_token})).status===200,'schema reload failed');report.checks.schema_reload=true;
 if(schemaCandidate){assert.ok([403,404].includes((await rpc('save_url_result_draft',ownerSession.access_token,{},'installed writer closed')).status),'closed writer');sql(await readFile(new URL('../private-site/schema/enable-save-review.sql',import.meta.url),'utf8'));await wait(async()=> (await rpc('save_url_result_draft',ownerSession.access_token,{p_organization_id:ids.org,p_opportunity_id:null,p_request_id:null,p_expected_version:0,p_payload:null})).status===400,'enabled RPC cache reload');}
 stage='HTTP Save Review';const payload=(await fixtures())[0],save={p_organization_id:ids.org,p_opportunity_id:parent(901),p_request_id:request(901),p_expected_version:0,p_payload:payload};
 const version=expect(await rpc('save_url_result_draft',ownerSession.access_token,save,'owner Save'),200,'owner Save');assert.match(version,/^[a-f0-9-]{36}$/);
 const versionPath='/content_versions?select=*&id=eq.'+version;
 const saved=expect(await call(restOrigin,versionPath,{token:ownerSession.access_token,record:'exact saved version'}),200,'exact version');assert.equal(saved.length,1);assert.deepEqual(saved[0].first_result_payload,payload);
 if(schemaCandidate){expect(await call(authOrigin,'/logout?scope=local',{method:'POST',token:ownerSession.access_token,record:'pre-Review native logout'}),204,'pre-Review logout');const previous=ownerSession.access_token;ownerSession=await login('owner');assert.notEqual(ownerSession.access_token,previous);assert.deepEqual(expect(await call(restOrigin,versionPath,{token:ownerSession.access_token}),200,'fresh before Review'),saved);report.checks.save_logout_fresh_before_review=true;}
 const review={p_organization_id:ids.org,p_version_id:version,p_request_id:request(902),p_source_digest:payload.snapshot.content_fingerprint,p_content_digest:payload.review.content_digest,p_version_digest:saved[0].first_result_request_digest,p_checks:checks};
 expect(await rpc('review_url_result',ownerSession.access_token,review,'owner exact Review'),200,'owner Review');
 const reviewPath='/content_reviews?select=*&version_id=eq.'+version;
 const reviewed=expect(await call(restOrigin,reviewPath,{token:ownerSession.access_token,record:'exact Review readback'}),200,'Review readback');assert.equal(reviewed.length,1);
 stage='logout fresh native login';expect(await call(authOrigin,'/logout?scope=local',{method:'POST',token:ownerSession.access_token,record:'native logout'}),204,'native logout');
 expect(await call(authOrigin,'/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:ownerSession.refresh_token},record:'logged out refresh rejected'}),400,'revoked refresh token');
 const oldToken=ownerSession.access_token;ownerSession=null;const fresh=await login('owner');assert.ok(fresh.access_token!==oldToken,'fresh server-issued JWT differs');
 assert.deepEqual(expect(await call(restOrigin,versionPath,{token:fresh.access_token,record:'fresh exact version'}),200,'fresh exact version'),saved);
 assert.deepEqual(expect(await call(restOrigin,reviewPath,{token:fresh.access_token,record:'fresh exact Review'}),200,'fresh exact Review'),reviewed);
 report.checks.fresh_native_login_exact_readback=true;report.checks.logout_revokes_refresh=true;
 if(schemaCandidate){const candidate=await import('../private-site/schema/native-checks.mjs');report.checks.schema_negatives=await candidate.httpChecks({sql,call,rpc,restOrigin,owner: fresh.access_token,save,review,version,versionPath,expect,snapshot,ids});}
 const before=snapshot();const badParts=fresh.access_token.split('.');badParts[2]=(badParts[2][0]==='A'?'B':'A')+badParts[2].slice(1);const bad=hide(badParts.join('.'));
 expect(await call(restOrigin,versionPath,{token:bad,record:'wrong signature read'}),401,'wrong signature read');expect(await rpc('save_url_result_draft',bad,save,'wrong signature write'),401,'wrong signature write');
 stage='native tenant denials';let foreign;
 for(const actor of ['viewer','foreign']){const session=await login(actor);if(actor==='foreign')foreign=session;
  const rows=expect(await call(restOrigin,'/content_versions?select=id&organization_id=eq.'+ids.org,{token:session.access_token,record:actor+' OrgA read'}),200,actor+' read');assert.equal(rows.length,actor==='viewer'?1:0);report.checks[actor+'_org_a_rows']=rows.length;
  expect(await rpc('save_url_result_draft',session.access_token,{...save,p_request_id:request(actor==='viewer'?903:904),p_expected_version:1},actor+' Save denied'),403,actor+' Save');expect(await rpc('review_url_result',session.access_token,{...review,p_request_id:request(actor==='viewer'?905:906)},actor+' Review denied'),403,actor+' Review');
 }
 stage='deleted native identity';const orgPath='/organizations?select=id&id=eq.'+ids.other;
 assert.equal(expect(await call(restOrigin,orgPath,{token:foreign.access_token}),200,'own org before identity deletion').length,1);
 expect(await call(authOrigin,'/admin/users/'+ids.foreign,{method:'DELETE',token:admin,record:'native delete foreign identity'}),200,'native delete identity');
 const deleted=await call(authOrigin,'/user',{token:foreign.access_token,record:'deleted native user rejected'});assert.ok([401,403].includes(deleted.status));
 assert.equal(expect(await call(restOrigin,orgPath,{token:foreign.access_token,record:'deleted identity own org hidden'}),200,'deleted identity RLS').length,0);
 expect(await rpc('save_url_result_draft',foreign.access_token,{...save,p_organization_id:ids.other,p_opportunity_id:parent(907),p_request_id:request(907)},'deleted identity Save denied'),403,'deleted identity Save');
 expect(await rpc('review_url_result',foreign.access_token,review,'deleted identity Review denied'),403,'deleted identity Review');
 assert.equal(snapshot(),before,'rejected operations leave versions/reviews/business audit identical');
 report.checks.business_counts=JSON.parse(sql("select jsonb_build_object('versions',(select count(*) from content_versions),'reviews',(select count(*) from content_reviews),'audit',(select count(*) from audit_events));"));assert.deepEqual(report.checks.business_counts,{versions:1,reviews:1,audit:2});
 report.checks.denied_business_delta=0;report.checks.deleted_native_identity_denied=true;
 if(schemaCandidate){stage='native candidate desktop/mobile';report.checks.ui=await (await import('../private-site/schema/ui-fixture.mjs')).verifyUI({login,call,authOrigin,restOrigin,payload,ids,snapshot,run});const candidate=await import('../private-site/schema/native-checks.mjs');report.checks.final_acl=candidate.checkCatalog(sql,true);sql(await readFile(new URL('../private-site/schema/disable-save-review.sql',import.meta.url),'utf8'));assert.ok([403,404].includes((await rpc('save_url_result_draft',fresh.access_token,save,'writer disabled at cleanup')).status),'closed after disable');report.checks.closed_after_disable=candidate.checkCatalog(sql,false);}
 report.result='PASS';
}catch(error){report.result='FAIL';let message=String(error.message);for(const value of redactions)if(value)message=message.replaceAll(value,'[REDACTED]');message=message.replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,'[REDACTED JWT]');report.failure={stage,message};try{let logs=docker(['logs',names[1]]);for(const value of redactions)if(value)logs=logs.replaceAll(value,'[REDACTED]');logs=logs.replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,'[REDACTED JWT]');report.failure.auth_diagnostic=logs.split('\n').filter(l=>/fatal|error/i.test(l)).join('\n').slice(-5000);}catch{}process.exitCode=1;}
finally{
 stage='cleanup';const cleanupErrors=[];
 for(const name of [...names].reverse())try{const existing=docker(['ps','-a','--filter','name=^/'+name+'$','--format','{{.Names}}']);if(existing){assert.equal(docker(['inspect','-f','{{index .Config.Labels "'+label+'"}}',name]),run);docker(['rm','-f',name]);}}catch{cleanupErrors.push(name);}
 try{if(docker(['network','ls','--filter','name=^'+network+'$','--format','{{.Name}}'])){assert.equal(docker(['network','inspect','-f','{{index .Labels "'+label+'"}}',network]),run);docker(['network','rm',network]);}}catch{cleanupErrors.push(network);}
 const remaining=docker(['ps','-a','--filter','label='+label+'='+run,'--format','{{.Names}}']);const remainingNetworks=docker(['network','ls','--filter','label='+label+'='+run,'--format','{{.Name}}']);
 let protectedUnchanged=!(await rootExists());for(const p of protectedPaths){const after=await readFile(p).then(hash,e=>{if(e.code==='ENOENT')return null;throw e;});protectedUnchanged&&=after===protectedBefore[p];}
 report.cleanup={checked_at:new Date().toISOString(),ownership_checked:true,remaining_containers:remaining,remaining_networks:remainingNetworks,persistent_root_absent:!(await rootExists()),old_markers_unchanged:protectedUnchanged,errors:cleanupErrors};
 if(cleanupErrors.length||remaining||remainingNetworks||!protectedUnchanged){report.result='FAIL';process.exitCode=1;}
 const text=JSON.stringify(report,null,2)+'\n';for(const value of redactions)if(value&&text.includes(value))throw Error('Secret appeared in evidence; refusing output');
 await writeFile('/tmp/'+run+'-evidence.json',text,{flag:'wx',mode:0o600});console.log(text);
}
