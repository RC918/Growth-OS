// Shared candidate configuration. Pure builder: no service start or secret generation.
export function nativeServiceEnv({db,jwt}) {
 if(!/^[a-f0-9]{64}$/.test(db)||!/^[a-f0-9]{80}$/.test(jwt))throw Error('Invalid native credential material');
 return {
  pg:`POSTGRES_PASSWORD=${db}\nPOSTGRES_DB=postgres\n`,
  auth:`GOTRUE_API_HOST=0.0.0.0\nGOTRUE_API_PORT=9999\nAPI_EXTERNAL_URL=http://127.0.0.1:8794\nGOTRUE_DB_DRIVER=postgres\nGOTRUE_DB_DATABASE_URL=postgres://supabase_auth_admin:${db}@db:5432/postgres\nGOTRUE_DB_NAMESPACE=auth\nGOTRUE_SITE_URL=http://127.0.0.1:8792\nGOTRUE_URI_ALLOW_LIST=http://127.0.0.1:8792/workspace.html\nGOTRUE_DISABLE_SIGNUP=true\nGOTRUE_JWT_ADMIN_ROLES=service_role\nGOTRUE_JWT_AUD=authenticated\nGOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated\nGOTRUE_JWT_EXP=300\nGOTRUE_JWT_SECRET=${jwt}\nGOTRUE_EXTERNAL_EMAIL_ENABLED=true\nGOTRUE_EXTERNAL_PHONE_ENABLED=false\nGOTRUE_EXTERNAL_ANONYMOUS_USERS_ENABLED=false\nGOTRUE_MAILER_AUTOCONFIRM=false\n`,
  rest:`PGRST_DB_URI=postgres://authenticator:${db}@db:5432/postgres\nPGRST_DB_SCHEMAS=public\nPGRST_DB_ANON_ROLE=anon\nPGRST_JWT_SECRET=${jwt}\nPGRST_DB_MAX_ROWS=501\nPGRST_DB_USE_LEGACY_GUCS=false\n`,
 };
}
