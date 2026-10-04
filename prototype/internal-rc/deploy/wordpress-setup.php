<?php
// Isolated candidate provisioning only; never copied to an Owner/external site.
define('WP_INSTALLING',true); $_SERVER['HTTPS']='on'; $_SERVER['HTTP_HOST']='rc-source.example';
require '/var/www/html/wp-load.php';require_once ABSPATH.'wp-admin/includes/upgrade.php';
if(is_blog_installed())throw new Exception('Existing site: refuse reinitialization');
wp_install('Internal RC synthetic page','setup','setup@example.invalid',false,'',bin2hex(random_bytes(32)));
add_role('growth_publisher','RC page publisher',['read'=>true,'edit_pages'=>true,'edit_published_pages'=>true]);
$uid=wp_create_user('rcpublisher',bin2hex(random_bytes(32)),'publisher@example.invalid');(new WP_User($uid))->set_role('growth_publisher');update_user_meta($uid,'growth_run_user',true);
$id=wp_insert_post(['import_id'=>1001,'post_type'=>'page','post_title'=>'RC steel bolt','post_content'=>'<p>Steel bolt for workshop assembly.</p>','post_status'=>'publish','post_name'=>'bolt','post_author'=>$uid,'post_date'=>'2026-01-01 00:00:00','post_date_gmt'=>'2026-01-01 00:00:00']);
$control=wp_insert_post(['import_id'=>1002,'post_type'=>'page','post_title'=>'RC control','post_content'=>'<p>Never change.</p>','post_status'=>'publish','post_name'=>'control']);
if($id!==1001||$control!==1002)throw new Exception('Fixed page identity failed');
update_post_meta($id,'growth_meta_description','Steel bolt baseline');update_option('growth_target',$id);update_option('growth_expires',time()+900);update_option('permalink_structure','/%postname%/');switch_theme('growth');flush_rewrite_rules();
$app=WP_Application_Passwords::create_new_application_password($uid,['name'=>'internal-rc-single-window']);
echo json_encode(['user'=>'rcpublisher','user_id'=>$uid,'password'=>$app[0],'uuid'=>$app[1]['uuid'],'page_id'=>$id,'expires_at'=>(int)get_option('growth_expires')*1000]);
