// Runner-owned resources only. No global trust/network configuration or persistent grant.
import {execFileSync} from 'node:child_process';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID,randomBytes} from 'node:crypto';
import http from 'node:http';
import assert from 'node:assert/strict';
import https from 'node:https';
export const images={wordpress:'wordpress:6.8.3-php8.3-apache@sha256:30bff39330d1693b0ce13d32fc9b7bb67193064f040b7d60d3494e136fa599d4',database:'mariadb:11.4.8@sha256:bc474f00629f0123c10f9e1bca193a45d18af15a274cf0656acda64f1086c3b6'};
const docker=(args,input)=>execFileSync('docker',args,{input,encoding:'utf8',timeout:60000,stdio:['pipe','pipe','pipe']}).trim();
const listen=s=>new Promise((ok,no)=>{s.once('error',no);s.listen(0,'127.0.0.1',ok);});
const pause=()=>new Promise(r=>setTimeout(r,200));
export async function createSite(){
 for(const image of Object.values(images))docker(['image','inspect',image]); // Pulls are explicit outside runner.
 const run='growth-wp-'+randomUUID(),db=run+'-db',wp=run+'-wp',dir=await mkdtemp(join(tmpdir(),run+'-'));
 let server,agent,auth=null,closed=false;const owned=[];
 const php=(code,installing=false)=>docker(['exec','-i',wp,'php'], '<?php '+(installing?'define("WP_INSTALLING",true); ':'')+'$_SERVER["HTTPS"]="on"; $_SERVER["HTTP_HOST"]="127.0.0.1"; require "/var/www/html/wp-load.php"; '+code);
 async function close(){if(closed)return;closed=true;auth=null;agent?.destroy();if(server?.listening){server.closeAllConnections();await new Promise(r=>server.close(r));}let failed=false;for(const name of owned.reverse())try{docker(['rm','-f',name]);}catch{failed=true;}await rm(dir,{recursive:true,force:true});if(failed)throw Error('Owned container cleanup incomplete');console.log('PASS WordPress cleanup: exact run containers removed; tmpfs DB/site/credentials and local TLS key removed; no prune');}
 try{
  const password=randomBytes(32).toString('hex');
  await writeFile(join(dir,'db.env'),`MARIADB_ROOT_PASSWORD=${password}\nMARIADB_DATABASE=growth\nMARIADB_USER=growth\nMARIADB_PASSWORD=${password}\n`,{mode:0o600});
  docker(['run','-d','--pull=never','--name',db,'--label','growth.run='+run,'--network','bridge','-p','127.0.0.1::80','--tmpfs','/var/lib/mysql:rw,size=512m','--env-file',join(dir,'db.env'),images.database,'--bind-address=127.0.0.1']);owned.push(db);
  const port=Number(docker(['port',db,'80/tcp']).split(':').at(-1));
  for(let i=0;;i++){try{docker(['exec',db,'healthcheck.sh','--connect','--innodb_initialized']);break;}catch{if(i>100)throw Error('Disposable DB unavailable');await pause();}}
  server=https.createServer(); // Bind first so the authoritative WordPress URL is stable for this run.
  execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',join(dir,'key.pem'),'-out',join(dir,'cert.pem'),'-days','1','-subj','/CN=127.0.0.1','-addext','subjectAltName=IP:127.0.0.1'],{stdio:'ignore'});
  const ca=await readFile(join(dir,'cert.pem'));server.setSecureContext({key:await readFile(join(dir,'key.pem')),cert:ca});
  await listen(server);const origin='https://127.0.0.1:'+server.address().port;
  server.on('request',(req,res)=>{const upstream=http.request({hostname:'127.0.0.1',port,path:req.url,method:req.method,headers:{...req.headers,host:new URL(origin).host,'x-forwarded-proto':'https'}},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res);});upstream.on('error',()=>{res.writeHead(502);res.end();});req.pipe(upstream);});
  await writeFile(join(dir,'wp.env'),`WORDPRESS_DB_HOST=127.0.0.1\nWORDPRESS_DB_USER=growth\nWORDPRESS_DB_PASSWORD=${password}\nWORDPRESS_DB_NAME=growth\nWORDPRESS_CONFIG_EXTRA=define('WP_HOME','${origin}'); define('WP_SITEURL','${origin}'); define('WP_HTTP_BLOCK_EXTERNAL',true); define('DISABLE_WP_CRON',true); define('AUTOMATIC_UPDATER_DISABLED',true);\n`,{mode:0o600});
  docker(['run','-d','--pull=never','--name',wp,'--label','growth.run='+run,'--network','container:'+db,'--tmpfs','/var/www/html:rw,size=512m','--env-file',join(dir,'wp.env'),images.wordpress]);owned.push(wp);
  for(let i=0;;i++){try{docker(['exec',wp,'test','-f','/var/www/html/wp-config.php']);break;}catch{if(i>100)throw Error('WordPress unavailable');await pause();}}
  docker(['exec','-i',wp,'sh','-c','mkdir -p /var/www/html/wp-content/mu-plugins; cat > /var/www/html/wp-content/mu-plugins/growth.php'],await readFile(new URL('./site-plugin.php',import.meta.url),'utf8'));
  const data=JSON.parse(php(`require_once ABSPATH.'wp-admin/includes/upgrade.php'; wp_install('Synthetic controlled site','setup', 'synthetic@example.invalid',false,'',bin2hex(random_bytes(32))); foreach(get_posts(['post_type'=>'any','numberposts'=>-1,'post_status'=>'any']) as $p) wp_delete_post($p->ID,true); add_role('growth_publisher','Run publisher',['read'=>true,'edit_pages'=>true,'edit_published_pages'=>true]); $uid=wp_create_user('runpublisher',bin2hex(random_bytes(32)),'publisher@example.invalid'); (new WP_User($uid))->set_role('growth_publisher'); update_user_meta($uid,'growth_run_user',true); $id=wp_insert_post(['post_type'=>'page','post_title'=>'Synthetic bolt baseline','post_content'=>'<p>Baseline steel bolt.</p>','post_status'=>'publish','post_name'=>'bolt','post_author'=>$uid,'post_excerpt'=>'Keep this excerpt','post_date'=>'2026-01-01 00:00:00','post_date_gmt'=>'2026-01-01 00:00:00']); $control=wp_insert_post(['post_type'=>'page','post_title'=>'Unchanged control','post_content'=>'<p>Never change.</p>','post_status'=>'publish','post_name'=>'control','post_author'=>1]); update_post_meta($id,'growth_meta_description','Baseline description'); update_post_meta($control,'growth_meta_description','Control description'); update_option('growth_target',$id); update_option('growth_expires',time()+900); update_option('permalink_structure','/%postname%/'); flush_rewrite_rules(); $app=WP_Application_Passwords::create_new_application_password($uid,['name'=>'disposable-run']); echo json_encode(['target'=>$id,'control'=>$control,'user'=>$uid,'password'=>$app[0],'uuid'=>$app[1]['uuid'],'version'=>get_bloginfo('version'),'expires_at'=>(int)get_option('growth_expires')*1000]);`,true));
  auth='Basic '+Buffer.from('runpublisher:'+data.password).toString('base64');delete data.password;
  // Minimal fixture theme: actual WordPress head/meta and content filters, predictable page identity.
  docker(['exec','-i',wp,'sh','-c','mkdir -p /var/www/html/wp-content/themes/growth; cat > /var/www/html/wp-content/themes/growth/style.css'],'/*\nTheme Name: Synthetic Growth\n*/');
  docker(['exec','-i',wp,'sh','-c','cat > /var/www/html/wp-content/themes/growth/index.php'],`<!doctype html><html><head><title><?php echo esc_html(get_the_title()); ?></title><?php wp_head(); ?></head><body><?php while(have_posts()): the_post(); ?><article data-page-id="<?php the_ID(); ?>"><?php the_content(); ?></article><?php endwhile; ?></body></html>`);
  php(`switch_theme('growth');`);
  await assert.rejects(new Promise((ok,no)=>{const req=https.get(origin,res=>{res.resume();ok();});req.on('error',no);}), /self-signed certificate/);
  agent=new https.Agent({ca});
  const call=(path,{method='GET',body,headers={},authenticated=true}={})=>new Promise((ok,no)=>{
   if(closed||!path.startsWith('/')||path.startsWith('//'))return no(Error('Closed or invalid local request'));
   const req=https.request(origin+path,{agent,method,headers:{...(authenticated?{authorization:auth}:{}),...(body?{'content-type':'application/json'}:{}),...headers}},res=>{let text='';res.on('data',x=>text+=x);res.on('end',()=>ok({status:res.statusCode,text,json:()=>JSON.parse(text)}));});req.setTimeout(8000,()=>req.destroy(Error('TLS request timed out')));req.on('error',no);req.end(body?JSON.stringify(body):undefined);
  });
  const path=id=>'/?rest_route=/wp/v2/pages/'+id+'&context=edit';
  const snapshot=()=>JSON.parse(php(`global $wpdb; echo json_encode(['posts'=>$wpdb->get_results("SELECT * FROM {$wpdb->posts} WHERE post_type='page' ORDER BY ID",ARRAY_A),'meta'=>$wpdb->get_results("SELECT * FROM {$wpdb->postmeta} ORDER BY meta_id",ARRAY_A)]);`));
  console.log('PASS official local WordPress '+data.version+' / MariaDB '+docker(['exec',db,'mariadb','--version'])+'; loopback only; client-local TLS trust');
  return {run,origin,targetURL:origin+'/bolt/',...data,call,path,snapshot,images,close,
   async revoke(){php(`WP_Application_Passwords::delete_all_application_passwords(${data.user});`);},
   async expire(){php(`update_option('growth_expires',time()-1);`);},
   async proof(){return {run,images,wordpress:data.version,resource_scope:'run containers/tmpfs/local TLS only'};}
  };
 }catch(error){await close();throw Error('Disposable WordPress setup failed: '+String(error.message).split('\n')[0]);}
}
