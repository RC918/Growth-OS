// Read only the synthetic control page and its metadata. No user/options table,
// credentials, tokens or password value can enter the evidence.
export const controlSnapshotPHP=`<?php
define('WP_USE_THEMES',false); $_SERVER['HTTPS']='on'; $_SERVER['HTTP_HOST']='rc-source.example';
require '/var/www/html/wp-load.php';
$p=get_post(1002); if(!$p || $p->post_type!=='page')throw new Exception('Control missing');
$row=$p->to_array(); $row['protected']=$row['post_password']!==''; unset($row['post_password']);
echo json_encode(['page'=>$row,'meta'=>get_post_meta(1002)]);
`;
