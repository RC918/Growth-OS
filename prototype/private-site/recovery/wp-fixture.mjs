// Bounded native WP candidate adapter; only exact-label disposable containers are accepted.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
export const contentTables=['wp_posts','wp_postmeta','wp_comments','wp_commentmeta','wp_terms','wp_termmeta','wp_term_relationships','wp_term_taxonomy','wp_links'];
const optionNames=['siteurl','home','blogname','blogdescription','permalink_structure','rewrite_rules','template','stylesheet','current_theme','show_on_front','page_on_front','page_for_posts','WPLANG','timezone_string','gmt_offset','date_format','time_format','blog_public','growth_target','growth_product_page_id','growth_pilot_attempts','growth_expires','growth_read_expires','wp_user_roles'];
const hash=s=>createHash('sha256').update(s).digest('hex');
export function wpRecovery(site){
 const wp=site.run+'-wp',db=site.run+'-db';let paused=false;
 const docker=(args,input,binary=false)=>execFileSync('docker',args,{input,encoding:binary?undefined:'utf8',timeout:60000,maxBuffer:64*1024*1024,stdio:['pipe','pipe','pipe']});
 const owned=n=>assert.equal(docker(['inspect','-f','{{index .Config.Labels "growth.run"}}',n]).trim(),site.run);
 const sql=q=>{owned(db);return docker(['exec','-i',db,'sh','-c','MYSQL_PWD="$MARIADB_ROOT_PASSWORD" exec mariadb -uroot --batch --raw --skip-column-names growth'],'SET NAMES utf8mb4;\n'+q).trim();};
 const php=q=>{owned(wp);return docker(['exec','-i',wp,'php'],'<?php '+q).trim();};
 const literal=s=>s===null?'NULL':String(s)===''?"''":"CONVERT(0x"+Buffer.from(String(s)).toString('hex')+" USING utf8mb4)";
 let apache=[];
 function apacheState(){return JSON.parse(php("$r=[];foreach(glob('/proc/[0-9]*/comm') as $p){if(trim(file_get_contents($p))==='apache2'){$pid=(int)basename(dirname($p));$r[$pid]=file_get_contents(dirname($p).'/status');}}echo json_encode($r);"));}
 function pause(){owned(wp);docker(['kill','--signal=SIGSTOP',wp]);apache=Object.keys(apacheState());assert.ok(apache.includes('1'));docker(['exec',wp,'kill','-STOP',...apache.filter(p=>p!=='1')]);for(const status of Object.values(apacheState()))assert.match(status,/State:\s+T/);paused=true;sql('SET GLOBAL read_only=1;');}
 function unpause(){if(paused){owned(wp);docker(['exec',wp,'kill','-CONT',...apache.filter(p=>p!=='1')]);docker(['kill','--signal=SIGCONT',wp]);paused=false;}}
 const fileScript=`import sys,tarfile,json,base64,hashlib,io
archive=tarfile.open(fileobj=io.BytesIO(sys.stdin.buffer.read()))
result=[]
fixed={'mu-plugins/growth.php','themes/growth-private/style.css','themes/growth-private/index.php','themes/growth-private/functions.php'}
for m in archive:
 p=m.name.removeprefix('wp-content/').rstrip('/')
 if p not in fixed and not p.startswith('uploads/'): continue
 if m.isdir(): continue
 assert m.isfile() and not m.issym() and not m.islnk() and '..' not in p.split('/')
 b=archive.extractfile(m).read()
 if p.startswith('uploads/'): assert p.endswith('.png') and b.startswith(b'\\x89PNG\\r\\n\\x1a\\n'), 'Only bounded candidate PNG uploads supported'
 result.append(dict(path=p,mode=m.mode,uid=m.uid,gid=m.gid,sha256=hashlib.sha256(b).hexdigest(),data=base64.b64encode(b).decode()))
assert fixed.issubset({x['path'] for x in result}), dict(missing=sorted(fixed-{x['path'] for x in result}),paths=archive.getnames()[-30:])
print(json.dumps(sorted(result,key=lambda x:x['path'])))`;
 return {pause,unpause,sql,quiescence:()=>({apache: Object.entries(apacheState()).map(([pid,status])=>({pid:Number(pid),stopped:/State:\s+T/.test(status)})),mariadb_read_only:sql('select @@global.read_only;')==='1'}),
  seedUpload(){php(`$p='/var/www/html/wp-content/uploads/recovery-proof.png';if(!is_dir(dirname($p)))mkdir(dirname($p),0755,true);file_put_contents($p,base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='));chmod($p,0644);chown($p,33);chgrp($p,33);`);},
  capture(){
   assert.equal(paused,true,'WP must be suspended at the common cut');assert.equal(sql("select count(*) from wp_posts where post_password<>'';"),'0','Password protected content unsupported');assert.equal(sql("select option_value from wp_options where option_name='active_plugins';"),'a:0:{}','Unmanifested plugin unsupported');
   const tables=[...contentTables,'wp_users','wp_usermeta','wp_options'],queries=tables.map(t=>{const columns=sql(`select column_name from information_schema.columns where table_schema='growth' and table_name='${t}' order by ordinal_position;`).split('\n');
    let where='',expr=c=>'`'+c+'`';
    if(t==='wp_users')expr=c=>c==='user_pass'?"'!recovery-disabled'":c==='user_activation_key'?"''":'`'+c+'`';
    if(t==='wp_usermeta')where=" where meta_key in ('wp_capabilities','wp_user_level','growth_run_user')";
    if(t==='wp_options'){where=' where option_name in ('+optionNames.map(s=>"'"+s+"'").join(',')+')';expr=c=>c==='option_value'?"CASE WHEN option_name IN ('growth_expires','growth_read_expires') THEN '0' ELSE option_value END":'`'+c+'`';}
    return `select JSON_OBJECT('table','${t}','rows',COALESCE(JSON_ARRAYAGG(JSON_OBJECT(${columns.map(c=>"'"+c+"',"+expr(c)).join(',')})),JSON_ARRAY())) from ${t}${where};`;});
   const records=sql('SET SESSION group_concat_max_len=33554432; SET TRANSACTION READ ONLY; START TRANSACTION WITH CONSISTENT SNAPSHOT;\n'+queries.join('\n')+'\nCOMMIT;').split('\n').map(JSON.parse);
   const data=Object.fromEntries(records.map(r=>[r.table,r.rows.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))]));
   for(const status of Object.values(apacheState()))assert.match(status,/State:\s+T/);const bytes=docker(['exec',wp,'tar','-C','/var/www/html','-cf','-','wp-content'],undefined,true),files=JSON.parse(execFileSync('python3',['-c',fileScript],{input:bytes,encoding:'utf8',maxBuffer:32*1024*1024}));
   return {files,database:data,images:site.images,excluded:{files:['wp-config.php','env','TLS keys','image-provided core/default themes/inactive plugins'],database:['user password hashes/activation keys','session_tokens','_application_passwords','non-allowlisted usermeta/options'],option_allowlist:optionNames,credentials:'fresh secure reprovision only; restored users locked; read/write leases zero'}};
  },
  restore(data){
   assert.equal(paused,true);assert.deepEqual(Object.keys(data.database).sort(),[...contentTables,'wp_users','wp_usermeta','wp_options'].sort());assert.deepEqual(data.images,site.images);
   const dump=data.database;assert.ok(dump.wp_users.every(u=>u.user_pass==='!recovery-disabled'&&!u.user_activation_key));assert.ok(dump.wp_usermeta.every(m=>['wp_capabilities','wp_user_level','growth_run_user'].includes(m.meta_key)));assert.ok(dump.wp_options.every(o=>optionNames.includes(o.option_name)));for(const key of ['growth_expires','growth_read_expires'])assert.equal(dump.wp_options.find(o=>o.option_name===key).option_value,'0');
   let q='START TRANSACTION;\n';for(const [t,rows] of Object.entries(dump)){q+=t==='wp_options'?'DELETE FROM wp_options WHERE option_name IN ('+optionNames.map(s=>"'"+s+"'").join(',')+');\n':`DELETE FROM ${t};\n`;for(const row of rows){const keys=Object.keys(row);assert.ok(keys.every(k=>/^[a-z_]+$|^ID$/.test(k)));q+=`INSERT INTO ${t} (${keys.map(k=>'`'+k+'`').join(',')}) VALUES (${keys.map(k=>literal(row[k])).join(',')});\n`;}}sql(q+'COMMIT;');
   // Tar is produced locally from validated fixed paths; extraction never accepts arbitrary archive paths.
   const script=`import sys,json,tarfile,io,base64,hashlib
items=json.load(sys.stdin)
out=tarfile.open(fileobj=sys.stdout.buffer,mode='w|')
for f in items:
 p=f['path']; assert p in {'mu-plugins/growth.php','themes/growth-private/style.css','themes/growth-private/index.php','themes/growth-private/functions.php'} or (p.startswith('uploads/') and p.endswith('.png'))
 assert '..' not in p.split('/') and not p.startswith('/')
 b=base64.b64decode(f['data'],validate=True);assert hashlib.sha256(b).hexdigest()==f['sha256']
 m=tarfile.TarInfo(p);m.size=len(b);m.mode=f['mode'];m.uid=f['uid'];m.gid=f['gid'];assert m.mode & 0o7022 == 0
 out.addfile(m,io.BytesIO(b))
out.close()`;
   const tar=execFileSync('python3',['-c',script],{input:JSON.stringify(data.files),maxBuffer:32*1024*1024});owned(wp);docker(['exec','-i',wp,'tar','--same-owner','-xpf','-','-C','/var/www/html/wp-content'],tar);
  },
  snapshot(){return JSON.parse(php(`$_SERVER['HTTPS']='on';$_SERVER['HTTP_HOST']='rc-source.example';require '/var/www/html/wp-load.php';global $wpdb;$out=[];foreach([${Object.values(site.pages).join(',')}] as $id){$out[]=['post'=>get_post($id)->to_array(),'meta'=>get_post_meta($id)];}echo json_encode($out);`));},
  assertClosed(){assert.equal(sql('select @@global.read_only;'),'1');assert.equal(sql("select count(*) from wp_usermeta where meta_key in ('session_tokens','_application_passwords');"),'0');assert.equal(sql("select count(*) from wp_users where user_pass<>'!recovery-disabled' or user_activation_key<>'';"),'0');assert.equal(sql("select count(*) from wp_options where option_name in ('growth_expires','growth_read_expires') and option_value<>'0';"),'0');}
 };
}
