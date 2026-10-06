// Native test-only assertions and identities. Never imported by the business builder.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {tables,writers} from './build.mjs';
const manifest=JSON.parse(await readFile(new URL('./manifest.json',import.meta.url),'utf8'));
const json=(sql,q)=>JSON.parse(sql(q));
const defaults=sql=>sql("select coalesce(jsonb_agg(to_jsonb(d) order by d.oid),'[]') from pg_default_acl d;");
const trigger=sql=>sql("select jsonb_build_object('enabled',evtenabled,'function_md5',md5(pg_get_functiondef(evtfoid))) from pg_event_trigger where evtname='ensure_rls';");
export function checkCatalog(sql,enabled){
 const actualTables=json(sql,"select jsonb_agg(jsonb_build_object('name',relname,'rls',relrowsecurity,'owner',pg_get_userbyid(relowner)) order by relname) from pg_class where relnamespace='public'::regnamespace and relkind='r';");assert.deepEqual(actualTables.map(t=>t.name),[...tables].sort());assert.ok(actualTables.every(t=>t.rls&&t.owner==='postgres'));
 const policies=json(sql,"select jsonb_agg(jsonb_build_object('table',tablename,'name',policyname,'command',cmd,'roles',roles,'using',qual,'check',with_check) order by tablename) from pg_policies where schemaname='public';");assert.equal(policies.length,14);assert.ok(policies.every(p=>p.command==='SELECT'&&p.check===null&&p.roles.join(',')==='authenticated'));assert.deepEqual(policies.map(p=>({name:p.name,table:p.table})).sort((a,b)=>a.name.localeCompare(b.name)),manifest.policies.slice().sort((a,b)=>a.name.localeCompare(b.name)));
 const acl=json(sql,"select coalesce(jsonb_agg(jsonb_build_object('table',c.relname,'grantee',case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,'privilege',a.privilege_type,'grantable',a.is_grantable) order by c.relname,a.grantee,a.privilege_type),'[]') from pg_class c cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a where c.relnamespace='public'::regnamespace and c.relkind='r' and a.grantee<>c.relowner;");assert.equal(acl.length,14);assert.ok(acl.every(a=>a.grantee==='authenticated'&&a.privilege==='SELECT'&&!a.grantable));
 const functions=json(sql,"select jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'owner',pg_get_userbyid(proowner),'definer',prosecdef,'config',proconfig,'auth',has_function_privilege('authenticated',p.oid,'EXECUTE'),'anon',has_function_privilege('anon',p.oid,'EXECUTE'),'service',has_function_privilege('service_role',p.oid,'EXECUTE')) order by p.oid::regprocedure::text) from pg_proc p where pronamespace in ('public'::regnamespace,'private'::regnamespace);");
 assert.deepEqual(functions.map(f=>f.signature).sort(),manifest.functions.map(f=>f.signature.replace('public.','')).sort());
 for(const f of functions){const signature=f.signature.startsWith('private.')?f.signature:'public.'+f.signature;assert.equal(f.owner,'postgres');assert.ok(f.config.includes('search_path=""'));assert.equal(f.anon,false);assert.equal(f.service,false);assert.equal(f.auth,signature==='private.has_org_role(uuid,text[])'||enabled&&writers.includes(signature));assert.equal(f.definer,['private.has_org_role(uuid,text[])',...writers.filter(w=>w.startsWith('private.'))].includes(signature));}
 const defaultGrants=Number(sql("select count(*) from pg_default_acl d cross join lateral aclexplode(d.defaclacl) a where d.defaclrole='postgres'::regrole and d.defaclobjtype='r' and d.defaclnamespace in (0,'public'::regnamespace) and a.grantee in (0,'anon'::regrole,'authenticated'::regrole,'service_role'::regrole);"));assert.equal(defaultGrants,0);
 return {tables:actualTables,policies,acl,functions,future_table_api_grants:defaultGrants};
}
export function installFixtureDefaults(sql){
 sql(`alter default privileges for role postgres in schema public grant all on tables to postgres;
 alter default privileges for role postgres in schema public grant execute on functions to anon,authenticated,service_role;
 create schema fixture_security;
 create function fixture_security.rls_auto_enable() returns event_trigger language plpgsql as $$declare c record;begin for c in select * from pg_event_trigger_ddl_commands() where object_type='table' and schema_name='public' loop execute 'alter table '||c.object_identity||' enable row level security';end loop;end $$;
 create event trigger ensure_rls on ddl_command_end when tag in ('CREATE TABLE','CREATE TABLE AS','SELECT INTO') execute function fixture_security.rls_auto_enable();`);
}
export async function installAndCheck({sql,ids}){
 // Reproduce relevant managed defaults and auto-RLS only in this disposable PostgreSQL.
 installFixtureDefaults(sql);
 const before=defaults(sql),rlsBefore=trigger(sql),authBefore=sql("select md5(string_agg(pg_get_functiondef(oid),E'\\n' order by oid)) from pg_proc where pronamespace='auth'::regnamespace and prokind='f';");
 const install=await readFile(new URL('./install.sql',import.meta.url),'utf8');
 sql('alter default privileges for role postgres in schema public grant select on tables to anon;');assert.throws(()=>sql(install),/Future table defaults must already be closed/);assert.equal(Number(sql("select count(*) from pg_class where relnamespace='public'::regnamespace and relkind='r';")),0);sql('alter default privileges for role postgres in schema public revoke select on tables from anon;');
 assert.equal(defaults(sql),before);
 sql(install);assert.equal(defaults(sql),before);assert.equal(trigger(sql),rlsBefore);assert.equal(sql("select md5(string_agg(pg_get_functiondef(oid),E'\\n' order by oid)) from pg_proc where pronamespace='auth'::regnamespace and prokind='f';"),authBefore);
 const catalog=checkCatalog(sql,false);
 assert.throws(()=>sql(install),/New empty business schema required/);assert.deepEqual(checkCatalog(sql,false),catalog);
 const probe=json(sql,"begin;create table public.future_probe(id uuid);select jsonb_build_object('anon',has_table_privilege('anon','public.future_probe','SELECT'),'auth',has_table_privilege('authenticated','public.future_probe','SELECT'),'service',has_table_privilege('service_role','public.future_probe','SELECT'),'rls',(select relrowsecurity from pg_class where oid='public.future_probe'::regclass));rollback;");assert.deepEqual(probe,{anon:false,auth:false,service:false,rls:true});
 for(const id of Object.values(ids))assert.match(id,/^[0-9a-f-]{36}$/);
 // Only test fixture seed; native GoTrue users already exist. No auth.users writes.
 sql(`insert into public.organizations(id,name,business_model) values('${ids.org}','Native candidate A','trade'),('${ids.other}','Native candidate B','trade');insert into public.organization_members(organization_id,user_id,role) values('${ids.org}','${ids.owner}','owner'),('${ids.org}','${ids.viewer}','viewer'),('${ids.other}','${ids.foreign}','owner');`);
 return {catalog,defaults_unchanged:true,default_acl_sha256:createHash('sha256').update(before).digest('hex'),ensure_rls_unchanged:true,ensure_rls:JSON.parse(rlsBefore),auth_functions_unchanged:true,unsafe_defaults_rejected_atomically:true,reapply_rejected_without_changes:true,new_future_table:probe};
}
export async function httpChecks({sql,call,rpc,restOrigin,owner,save,review,version,versionPath,expect,snapshot,ids}){
 const before=snapshot(),catalog=checkCatalog(sql,true);
 for(const table of tables){const r=await call(restOrigin,'/'+table+'?select=*',{record:'anon '+table+' denied'});assert.ok([401,403].includes(r.status));}
 for(const name of ['save_url_result_draft','review_url_result'])assert.ok([401,403,404].includes((await rpc(name,null,name.startsWith('save')?save:review,'anon RPC denied')).status));
 for(const [path,method,body]of [['/content_versions?id=eq.'+version,'PATCH',{title:'tamper'}],['/content_versions?id=eq.'+version,'DELETE',null],['/audit_events','POST',{organization_id:ids.org,event_type:'forged',object_type:'content_version'}],['/organization_members','POST',{organization_id:ids.org,user_id:ids.foreign,role:'owner'}]])expect(await call(restOrigin,path,{method,body,token:owner,record:'direct '+method+' denied'}),403,'direct table writes denied');
 for(const t of ['audit_events','organization_members','content_versions','content_reviews'])for(const role of ['anon','authenticated','service_role'])assert.throws(()=>sql(`begin;set local role ${role};truncate public.${t};rollback;`),/permission denied/);
 expect(await rpc('save_url_result_draft',owner,save,'exact Save replay'),200,'same Save replay');expect(await rpc('review_url_result',owner,review,'exact Review replay'),200,'same Review replay');assert.equal(snapshot(),before);
 const changed=structuredClone(save);changed.p_payload.preview.fields.title.suggested='tampered';expect(await rpc('save_url_result_draft',owner,changed,'replay changed payload'),400,'changed replay');
 expect(await rpc('save_url_result_draft',owner,{...save,p_request_id:randomUUID()},'stale expected version'),409,'stale Save');
 expect(await rpc('review_url_result',owner,{...review,p_request_id:randomUUID()},'duplicate Review request'),409,'duplicate Review');
 expect(await rpc('review_url_result',owner,{...review,p_source_digest:'sha256:'+'0'.repeat(64)},'wrong source digest'),400,'wrong digest');
 expect(await rpc('review_url_result',owner,{...review,p_checks:{...review.p_checks,source:false}},'unchecked Review'),400,'unchecked Review');
 for(const name of ['save_first_result_draft','create_content_draft','save_goal_turn','save_business_profile','model_trial_reserve'])expect(await rpc(name,owner,{},'absent legacy RPC '+name),404,'legacy RPC absent');
 // Read-only unknown lookup: missing request/version cannot mutate or authorize a new write.
 assert.deepEqual(expect(await call(restOrigin,'/content_versions?first_result_request_id=eq.'+randomUUID(),{token:owner,record:'unknown Save request readback'}),200,'unknown lookup'),[]);
 assert.equal(snapshot(),before);assert.deepEqual(checkCatalog(sql,true),catalog);
 return {anonymous_tables_denied:tables.length,anonymous_rpcs_denied:2,direct_writes_and_truncate_denied:true,replay_exact_zero_delta:true,changed_or_stale_replay_rejected:true,duplicate_review_rejected:true,wrong_digest_and_unchecked_rejected:true,legacy_rpcs_absent:true,unknown_readback_zero_delta:true,catalog};
}
