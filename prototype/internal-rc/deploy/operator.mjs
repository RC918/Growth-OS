// PREPARED CANDIDATE, NOT AUTHORIZATION. Owner approval is required before provision/cleanup.
// `inspect` is read-only; no module import starts services or writes secrets.
import {readFile,writeFile,mkdir,rm,stat} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {randomBytes,createHmac,createHash} from 'node:crypto';
import {compose,root,prefix} from './compose.mjs';
import {schema} from './schema.mjs';
import {ids} from '../../../supabase/drafts/first_result_save/fixtures.mjs';
import {createRunJournal} from '../../wordpress-publish/journal.mjs';
const action=process.argv[2],windowPath=process.argv[3];
const docker=(args,input)=>{try{return execFileSync('docker',args,{input,encoding:'utf8',stdio:['pipe','pipe','pipe'],timeout:60000});}catch{throw Error('Owned Docker action failed or uncertain; inspect with credential redaction, no automatic retry');}};
const write=(name,data)=>writeFile(root+'/'+name,data,{mode:0o600,flag:'wx'});
const pause=()=>new Promise(r=>setTimeout(r,500));
async function approval(){
 const w=JSON.parse(await readFile(windowPath,'utf8'));
 if(w.environment!==prefix||!w.owner_approval_reference||!Number.isFinite(Date.parse(w.expires_at))||Date.now()>=Date.parse(w.expires_at)||Date.parse(w.expires_at)-Date.now()>2*3600000)throw Error('Specific unexpired approved RC window required (max two hours)');
 const hashes=JSON.parse(await readFile(new URL('./hashes.json',import.meta.url),'utf8'));
 const digest=createHash('sha256').update(JSON.stringify(hashes)).digest('hex');if(w.artifacts_digest!==digest)throw Error('Approved artifact set mismatch');
 for(const [path,sha]of Object.entries(hashes))if(createHash('sha256').update(await readFile(path)).digest('hex')!==sha)throw Error('Candidate file changed: '+path);
 return w;
}
async function ready(url){for(let i=0;i<80;i++){try{const r=await fetch(url,{signal:AbortSignal.timeout(1000)});if(r.ok)return;}catch{}await pause();}throw Error('Native service not ready');}
async function nativeUser(admin,actor,password){const r=await fetch('http://127.0.0.1:8794/admin/users',{method:'POST',headers:{authorization:'Bearer '+admin,'content-type':'application/json'},body:JSON.stringify({id:ids[actor],email:actor+'@rc.example.invalid',password,email_confirm:true})});if(!r.ok||(await r.json()).id!==ids[actor])throw Error('Real Auth creation failed; reconcile existing users, do not rerun provision');}
if(action==='inspect'){
 const hashes=JSON.parse(await readFile(new URL('./hashes.json',import.meta.url)));console.log(JSON.stringify({environment:prefix,root,artifacts_digest:createHash('sha256').update(JSON.stringify(hashes)).digest('hex'),compose:await compose()},null,2));
}else if(action==='verify'){
 const w=await approval(),original=JSON.parse(await readFile(root+'/window.json','utf8'));if(JSON.stringify(w)!==JSON.stringify(original))throw Error('Original RC window mismatch');console.log('Original window and candidate hashes match; no writes');
}else if(action==='provision'){
 const window=await approval();await writeFile(windowPath+'.started',JSON.stringify({environment:prefix,started_at:new Date().toISOString()}),{flag:'wx',mode:0o600});await mkdir(root,{mode:0o700});await write('window.json',JSON.stringify(window,null,2)); // exclusive: refuse previous installation
 for(const d of ['secrets','data','evidence'])await mkdir(root+'/'+d,{mode:0o700});
 const db=randomBytes(32).toString('hex'),jwt=randomBytes(40).toString('hex');
 await write('secrets/pg.env',`POSTGRES_PASSWORD=${db}\nPOSTGRES_DB=postgres\n`);
 await write('roles.sql',await readFile(new URL('./roles.sql',import.meta.url)));
 await write('secrets/auth.env',`GOTRUE_API_HOST=0.0.0.0\nGOTRUE_API_PORT=9999\nAPI_EXTERNAL_URL=http://127.0.0.1:8794\nGOTRUE_DB_DRIVER=postgres\nGOTRUE_DB_DATABASE_URL=postgres://supabase_auth_admin:${db}@db:5432/postgres\nGOTRUE_DB_NAMESPACE=auth\nGOTRUE_SITE_URL=http://127.0.0.1:8792\nGOTRUE_URI_ALLOW_LIST=http://127.0.0.1:8792/workspace.html\nGOTRUE_DISABLE_SIGNUP=true\nGOTRUE_JWT_ADMIN_ROLES=service_role\nGOTRUE_JWT_AUD=authenticated\nGOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated\nGOTRUE_JWT_EXP=300\nGOTRUE_JWT_SECRET=${jwt}\nGOTRUE_EXTERNAL_EMAIL_ENABLED=true\nGOTRUE_EXTERNAL_PHONE_ENABLED=false\nGOTRUE_EXTERNAL_ANONYMOUS_USERS_ENABLED=false\nGOTRUE_MAILER_AUTOCONFIRM=false\n`);
 await write('secrets/rest.env',`PGRST_DB_URI=postgres://authenticator:${db}@db:5432/postgres\nPGRST_DB_SCHEMAS=public\nPGRST_DB_ANON_ROLE=anon\nPGRST_JWT_SECRET=${jwt}\nPGRST_DB_MAX_ROWS=501\nPGRST_DB_USE_LEGACY_GUCS=false\n`);
 await write('secrets/maria.env',`MARIADB_ROOT_PASSWORD=${db}\nMARIADB_DATABASE=growth\nMARIADB_USER=growth\nMARIADB_PASSWORD=${db}\n`);
 await write('secrets/wp.env',`WORDPRESS_DB_HOST=mariadb\nWORDPRESS_DB_USER=growth\nWORDPRESS_DB_PASSWORD=${db}\nWORDPRESS_DB_NAME=growth\nWORDPRESS_CONFIG_EXTRA=define('WP_HOME','https://rc-source.example'); define('WP_SITEURL','https://rc-source.example'); define('WP_HTTP_BLOCK_EXTERNAL',true); define('DISABLE_WP_CRON',true); define('AUTOMATIC_UPDATER_DISABLED',true);\n`);
 await write('compose.json',JSON.stringify(await compose(),null,2));
 // First pulls/new local persistent services are within the PENDING envelope, never an offline test.
 docker(['compose','-f',root+'/compose.json','up','-d']);await ready('http://127.0.0.1:8794/health');
 const b64=v=>Buffer.from(JSON.stringify(v)).toString('base64url'),unsigned=b64({alg:'HS256',typ:'JWT'})+'.'+b64({role:'service_role',aud:'authenticated',exp:Math.floor(Date.parse(window.expires_at)/1000)}),admin=unsigned+'.'+createHmac('sha256',jwt).update(unsigned).digest('base64url');
 const credentials={};for(const actor of ['owner','viewer','foreign']){const password=randomBytes(32).toString('hex');await nativeUser(admin,actor,password);credentials[actor]={id:ids[actor],email:actor+'@rc.example.invalid',password};}await write('secrets/identities.json',JSON.stringify(credentials));
 const sql=await readFile(new URL('./schema.candidate.sql',import.meta.url),'utf8');if(sql!==await schema())throw Error('Schema artifact mismatch');await write('schema.sql',sql);docker(['exec','-i',prefix+'-db','psql','-X','-U','postgres','-v','ON_ERROR_STOP=1'],sql);
 for(let i=0;;i++){try{docker(['exec',prefix+'-wordpress','test','-f','/var/www/html/wp-config.php']);break;}catch{if(i===80)throw Error('WordPress unavailable');await pause();}}
 docker(['exec','-i',prefix+'-wordpress','sh','-c','mkdir -p /var/www/html/wp-content/mu-plugins; cat > /var/www/html/wp-content/mu-plugins/growth.php'],await readFile(new URL('../../wordpress-publish/site-plugin.php',import.meta.url)));
 docker(['exec','-i',prefix+'-wordpress','sh','-c','mkdir -p /var/www/html/wp-content/themes/growth; cat > /var/www/html/wp-content/themes/growth/style.css'],'/*\nTheme Name: Internal RC\n*/');
 docker(['exec','-i',prefix+'-wordpress','sh','-c','cat > /var/www/html/wp-content/themes/growth/index.php'],await readFile(new URL('./theme.php',import.meta.url)));
 const secret=JSON.parse(docker(['exec','-i',prefix+'-wordpress','php'],await readFile(new URL('./wordpress-setup.php',import.meta.url))));secret.run=prefix;await write('secrets/wordpress.json',JSON.stringify(secret));
 execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',root+'/secrets/key.pem','-out',root+'/secrets/cert.pem','-days','1','-subj','/CN=127.0.0.1','-addext','subjectAltName=IP:127.0.0.1'],{stdio:'ignore'});
 await write('secrets/tls.json',JSON.stringify({key:await readFile(root+'/secrets/key.pem','utf8'),cert:await readFile(root+'/secrets/cert.pem','utf8')}));
 const bound={run:prefix,journal_id:'40000000-0000-4000-8000-000000000001',organization_id:ids.org,page_id:1001,target_url:'https://rc-source.example/bolt/',expires_at:Math.min(secret.expires_at,Date.parse(window.expires_at))};if(bound.expires_at!==secret.expires_at)throw Error('Insufficient approved time for original grant');
 createRunJournal(root+'/data/publication.json',bound);
 await write('config.json',JSON.stringify({listen_origin:'http://127.0.0.1:8792',backend_origin:'https://growth-internal-rc.supabase.co',public_key:'sb_publishable_internal_rc',auth_url:'http://127.0.0.1:8794',rest_url:'http://127.0.0.1:8795',bound,journal_path:root+'/data/publication.json',wordpress_secret:root+'/secrets/wordpress.json',tls_secret:root+'/secrets/tls.json',source_mode:'owned-network-fixture',source_database:root+'/data/source.sqlite'},null,2));
 console.log('Provisioned isolated RC; fixed original 900-second grant, no extension. Start runtime separately.');
}else if(action==='cleanup'){
 // Original cleanup authority persists after expiry; match the frozen window/artifact identity.
 const w=JSON.parse(await readFile(root+'/window.json','utf8')),expected=JSON.parse(await readFile(windowPath,'utf8'));if(JSON.stringify(w)!==JSON.stringify(expected))throw Error('Wrong cleanup window');
 const names=['auth','rest','wordpress','mariadb','db'].map(x=>prefix+'-'+x);
 const existing=new Set(docker(['ps','-a','--format','{{.Names}}']).trim().split('\n'));
 for(const name of names){if(!existing.has(name))continue;const label=docker(['inspect','-f','{{index .Config.Labels "growth.rc"}}',name]).trim();if(label!==prefix)throw Error('Foreign resource');}
 // Owner-only RC data/credentials, never global Docker prune or unrelated volumes.
 if(await stat(root+'/compose.json').then(()=>true,()=>false))docker(['compose','-f',root+'/compose.json','down']);
 const image=(await compose()).services.db.image;if(await stat(root+'/data').then(()=>true,()=>false))docker(['run','--rm','--pull=never','--name',prefix+'-cleanup','--label','growth.rc='+prefix,'--network','none','--user','0','--mount','type=bind,src='+root+'/data,dst=/owned-data',image,'sh','-c','rm -rf /owned-data/postgres /owned-data/mariadb /owned-data/wordpress']);await rm(root,{recursive:true});console.log('Only exact RC resources, data and credentials removed; no prune.');
}else throw Error('Use inspect, verify, provision or cleanup; deployment requires separate approval.');
