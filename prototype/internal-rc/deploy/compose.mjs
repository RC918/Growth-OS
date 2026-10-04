import {readFile} from 'node:fs/promises';
import {images as wp} from '../../wordpress-publish/site.mjs';
export const root='/workspace/growth-internal-rc-01';
export const prefix='growth-internal-rc-01';
export async function compose(){
 const images=JSON.parse(await readFile(new URL('./images.json',import.meta.url)));
 const service=(name,image,extra)=>({container_name:prefix+'-'+name,image,restart:'no',labels:{'growth.rc':prefix},...extra});
 return {name:prefix,services:{
  db:service('db','postgres:17.6@sha256:00bc86618629af00d2937fdc5a5d63db3ff8450acf52f0636ec813c7f4902929',{env_file:[root+'/secrets/pg.env'],volumes:[root+'/data/postgres:/var/lib/postgresql/data',root+'/roles.sql:/docker-entrypoint-initdb.d/01-roles.sql:ro'],healthcheck:{test:['CMD-SHELL','pg_isready -U postgres'],interval:'2s',timeout:'3s',retries:40}}),
  auth:service('auth',images['supabase/gotrue'],{depends_on:{db:{condition:'service_healthy'}},env_file:[root+'/secrets/auth.env'],ports:['127.0.0.1:8794:9999']}),
  rest:service('rest',images['postgrest/postgrest'],{depends_on:{db:{condition:'service_healthy'}},env_file:[root+'/secrets/rest.env'],ports:['127.0.0.1:8795:3000']}),
  mariadb:service('mariadb',wp.database,{env_file:[root+'/secrets/maria.env'],volumes:[root+'/data/mariadb:/var/lib/mysql'],healthcheck:{test:['CMD','healthcheck.sh','--connect','--innodb_initialized'],interval:'2s',timeout:'3s',retries:40}}),
  wordpress:service('wordpress',wp.wordpress,{depends_on:{mariadb:{condition:'service_healthy'}},env_file:[root+'/secrets/wp.env'],volumes:[root+'/data/wordpress:/var/www/html'],ports:['127.0.0.1:8796:80']})
 }};
}
