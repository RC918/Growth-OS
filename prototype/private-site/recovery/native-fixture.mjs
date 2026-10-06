// Disposable recovery test adapter. Native GoTrue owns identity creation; no hosted route.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {randomBytes,randomUUID,createHmac} from 'node:crypto';
import {compose} from '../../internal-rc/deploy/compose.mjs';
import {nativeServiceEnv} from '../../internal-rc/deploy/native-env.mjs';
import {tables} from '../schema/build.mjs';
import {installAndCheck,checkCatalog,installFixtureDefaults} from '../schema/native-checks.mjs';
export async function nativeFixture({ids=Object.fromEntries(['owner','viewer','foreign','org','other'].map(k=>[k,randomUUID()])),restore=null}={}){
 const run='growth-recovery-native-'+randomUUID(),network=run+'-net',label='growth.native_fixture',names=['db','auth','rest'].map(s=>run+'-'+s),secrets=[],credentials={},images=(await compose()).services;
 const hide=v=>(secrets.push(v),v),db=hide(randomBytes(32).toString('hex')),jwt=hide(randomBytes(40).toString('hex')),env=nativeServiceEnv({db,jwt});let authOrigin,restOrigin,closed=false,paused=false;
 const docker=(args,input,environment)=>{try{return execFileSync('docker',args,{input,encoding:'utf8',env:{...process.env,...environment},timeout:60000,stdio:['pipe','pipe','pipe'],maxBuffer:32*1024*1024}).trim();}catch(e){let detail=String(e.stderr??'');for(const value of secrets)detail=detail.replaceAll(value,'[REDACTED]');throw Error('Owned native command failed: '+args[0]+' '+detail.slice(-1500));}};
 const owned=n=>assert.equal(docker(['inspect','-f','{{index .Config.Labels "'+label+'"}}',n]),run);
 const sql=q=>{owned(names[0]);return docker(['exec','-i','--user','postgres',names[0],'psql','-XAtq','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],q);};
 async function wait(fn){for(let n=0;n<100;n++){try{if(await fn())return;}catch{}await new Promise(r=>setTimeout(r,200));}throw Error('Native readiness timeout');}
 function start(s,extra=[]){const environment=Object.fromEntries(env[s==='db'?'pg':s].trim().split('\n').map(l=>{const i=l.indexOf('=');return[l.slice(0,i),l.slice(i+1)];}));docker(['run','-d','--rm','--pull=never','--name',run+'-'+s,'--label',label+'='+run,'--network',network,...(s==='db'?['--network-alias','db']:['--read-only','--tmpfs','/tmp']),...extra,...Object.keys(environment).flatMap(k=>['--env',k]),images[s].image],undefined,environment);}
 function origin(s,port){const name=run+'-'+s;owned(name);assert.equal(docker(['inspect','-f','{{json .NetworkSettings.Ports}}',name]),'{}');return 'http://'+docker(['inspect','-f','{{with index .NetworkSettings.Networks "'+network+'"}}{{.IPAddress}}{{end}}',name])+':'+port;}
 async function call(origin,path,{method='GET',token,body}={}){assert.ok([authOrigin,restOrigin].includes(origin));const r=await fetch(origin+path,{method,redirect:'error',signal:AbortSignal.timeout(5000),headers:{...(token?{authorization:'Bearer '+token}:{}),...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json().catch(()=>null)};}
 async function login(actor){const r=await call(authOrigin,'/token?grant_type=password',{method:'POST',body:credentials[actor]});assert.equal(r.status,200);hide(r.data.access_token);hide(r.data.refresh_token);assert.equal(r.data.user.id,ids[actor]);assert.equal((await call(authOrigin,'/user',{token:r.data.access_token})).status,200);return r.data;}
 const exportRows=()=>Object.fromEntries(tables.map(t=>[t,JSON.parse(sql(`select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]') from public.${t} t;`))]));
 async function close(){if(closed)return;closed=true;for(const name of [...names].reverse()){if(docker(['ps','-a','--filter','name=^/'+name+'$','--format','{{.Names}}'])){owned(name);docker(['rm','-f',name]);}}if(docker(['network','ls','--filter','name=^'+network+'$','--format','{{.Name}}'])){assert.equal(docker(['network','inspect','-f','{{index .Labels "'+label+'"}}',network]),run);docker(['network','rm',network]);}assert.equal(docker(['ps','-a','--filter','label='+label+'='+run,'--format','{{.Names}}']),'');}
 try{
 docker(['network','create','--internal','--label',label+'='+run,network]);
 // TCP excludes the image entrypoint's temporary Unix-socket-only bootstrap server.
 start('db',['--tmpfs','/var/lib/postgresql/data','--tmpfs','/var/run/postgresql']);await wait(()=>{docker(['exec',names[0],'pg_isready','-h','127.0.0.1','-U','postgres']);return true;});sql(await readFile(new URL('../../internal-rc/deploy/roles.sql',import.meta.url),'utf8'));
 start('auth');authOrigin=origin('auth',9999);start('rest');restOrigin=origin('rest',3000);await wait(async()=> (await call(authOrigin,'/health')).status===200);sql(await readFile(new URL('../../internal-rc/deploy/auth-ready.sql',import.meta.url),'utf8'));assert.equal(Number(sql('select count(*) from auth.schema_migrations;')),70);
 const b64=v=>Buffer.from(JSON.stringify(v)).toString('base64url'),s=b64({alg:'HS256',typ:'JWT'})+'.'+b64({role:'service_role',aud:'authenticated',exp:Math.floor(Date.now()/1000)+600}),admin=hide(s+'.'+createHmac('sha256',jwt).update(s).digest('base64url'));
 for(const actor of ['owner','viewer','foreign']){credentials[actor]={email:actor+'@recovery.example.invalid',password:hide(randomBytes(32).toString('hex'))};assert.equal((await call(authOrigin,'/admin/users',{method:'POST',token:admin,body:{id:ids[actor],...credentials[actor],email_confirm:true}})).status,200);}
 if(restore){
  assert.deepEqual(Object.keys(restore).sort(),[...tables].sort());installFixtureDefaults(sql);sql(await readFile(new URL('../schema/install.sql',import.meta.url),'utf8'));
  for(const t of tables)assert.equal(Number(sql(`select count(*) from public.${t};`)),0);
  const literal=v=>"'"+JSON.stringify(v).replaceAll("'","''")+"'::jsonb";
  sql('begin;\n'+tables.map(t=>`insert into public.${t} select * from jsonb_populate_recordset(null::public.${t},${literal(restore[t])});`).join('\n')+'\ncommit;');assert.deepEqual(exportRows(),restore);checkCatalog(sql,false);
 }else{await installAndCheck({sql,ids});sql(await readFile(new URL('../schema/enable-save-review.sql',import.meta.url),'utf8'));}
 const ready=await login('owner');await wait(async()=> (await call(restOrigin,'/content_versions?select=id',{token:ready.access_token})).status===200);
 return {run,ids,login,call,authOrigin,restOrigin,sql,exportRows,close,secrets,security:()=>JSON.parse(sql("select jsonb_build_object('defaults',(select coalesce(jsonb_agg(jsonb_build_object('schema',n.nspname,'type',d.defaclobjtype,'acl',d.defaclacl::text) order by n.nspname,d.defaclobjtype),'[]') from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace),'ensure_rls',(select jsonb_build_object('enabled',evtenabled,'definition',pg_get_functiondef(evtfoid)) from pg_event_trigger where evtname='ensure_rls'));")),images:Object.fromEntries(Object.entries(images).map(([k,v])=>[k,v.image])),snapshot:()=>sql("select jsonb_build_object('versions',(select coalesce(jsonb_agg(to_jsonb(v) order by id),'[]') from content_versions v),'reviews',(select coalesce(jsonb_agg(to_jsonb(r) order by id),'[]') from content_reviews r),'audit',(select coalesce(jsonb_agg(to_jsonb(a) order by id),'[]') from audit_events a));"),
  async quiesce(){assert.equal(paused,false);for(const n of names.slice(1)){owned(n);docker(['stop','--time','10',n]);}paused=true;sql(await readFile(new URL('../schema/disable-save-review.sql',import.meta.url),'utf8'));checkCatalog(sql,false);return {api_containers_exited:true,writer_acl_closed:true,source:run};},
  assertNoSecrets(bytes){for(const value of secrets)assert.equal(bytes.includes(value),false,'No native secret in backup/evidence');}};
 }catch(e){await close();throw e;}
}
