// Short-lived fixture only. Extends the owned native WordPress site without changing frozen RC files.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {createSite} from '../../wordpress-publish/site.mjs';
import {content} from './content.mjs';
export async function createThemedSite(){
 const site=await createSite({sourceFixture:true,pilotFixture:true});
 const name=site.run+'-wp';
 function docker(args,input){assert.equal(execFileSync('docker',['inspect','-f','{{index .Config.Labels "growth.run"}}',name],{encoding:'utf8'}).trim(),site.run);return execFileSync('docker',args,{input,encoding:'utf8',timeout:30000,stdio:['pipe','pipe','pipe']}).trim();}
 const php=code=>docker(['exec','-i',name,'php'],'<?php $_SERVER["HTTPS"]="on"; $_SERVER["HTTP_HOST"]="rc-source.example"; require "/var/www/html/wp-load.php"; '+code);
 try{
  for(const file of ['style.css','index.php','functions.php'])docker(['exec','-i',name,'sh','-c','mkdir -p /var/www/html/wp-content/themes/growth-private; cat > /var/www/html/wp-content/themes/growth-private/'+file],await readFile(new URL('./growth-private/'+file,import.meta.url),'utf8'));
  const pack=await content(),encoded=Buffer.from(JSON.stringify(pack)).toString('base64');
  const pages=JSON.parse(php(`$pack=json_decode(base64_decode('${encoded}'),true);$out=[];foreach($pack['pages'] as $i=>$page){$id=1001+$i;$body=$page['kind']==='product'?'<p>'.esc_html($page['description']).'</p>':'';$data=['post_type'=>'page','post_status'=>'publish','post_name'=>$page['slug'],'post_title'=>$page['title'],'post_content'=>$body,'post_excerpt'=>'','comment_status'=>'closed','ping_status'=>'closed'];if($i<2){$data['ID']=$id;wp_update_post($data);}else{$id=wp_insert_post($data);}update_post_meta($id,'growth_page_kind',$page['kind']);update_post_meta($id,'growth_product_name',$page['product_name']);update_post_meta($id,'growth_sections',$page['sections']);update_post_meta($id,'growth_meta_description',$page['meta_description']);$out[$page['slug']]=$id;}update_option('growth_product_page_id',$out['growth-os']);switch_theme('growth-private');flush_rewrite_rules();echo json_encode($out);`));
  assert.equal(pages['growth-os'],site.target);assert.equal(pages.about,site.control);
  const controls=()=>JSON.parse(php(`$out=[];foreach([${pages.about},${pages.privacy}] as $id){$p=get_post($id)->to_array();unset($p['post_password']);$out[]=['post'=>$p,'meta'=>get_post_meta($id)];}echo json_encode($out);`));
  return {...site,pages,pack,controls};
 }catch(e){await site.close();throw e;}
}
