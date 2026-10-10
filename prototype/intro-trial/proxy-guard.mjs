// Read-only checks. Native Node owns proxy URLs/credentials; never log or rewrite them.
// This entry point requires the explicit, single-process --use-env-proxy flag.
export function requireAuthorizedProxy(env=process.env,args=process.execArgv){
 if(!process.allowedNodeEnvironmentFlags.has('--use-env-proxy')||!args.includes('--use-env-proxy')||args.includes('--no-use-env-proxy')||env.NODE_OPTIONS||env.NODE_USE_ENV_PROXY==='0')throw Error('PROXY_OPT_IN_REQUIRED');
 if(!(env.https_proxy??env.HTTPS_PROXY))throw Error('HTTPS_PROXY_REQUIRED');
 if(env.NODE_TLS_REJECT_UNAUTHORIZED!==undefined&&env.NODE_TLS_REJECT_UNAUTHORIZED!=='1')throw Error('TLS_VERIFICATION_REQUIRED');
 // Conservatively check BOTH spellings, ignoring port restrictions. Ambiguous
 // syntax is rejected, never repaired by removing NO_PROXY entries.
 for(const value of [env.no_proxy,env.NO_PROXY])for(const entry of (value||'').toLowerCase().split(/[,\s]+/).filter(Boolean)){
  if(['::1','[::1]'].includes(entry))continue;
  if(!/^(?:\*\.)?\.?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.?(?::[0-9]+)?$/.test(entry))throw Error('PROXY_BYPASS_UNVERIFIED');
  const host=entry.replace(/:[0-9]+$/,'').replace(/^\*?\./,'').replace(/\.$/,'');
  if('api.openai.com'===host||'api.openai.com'.endsWith('.'+host))throw Error('PROXY_BYPASS_UNVERIFIED');
 }
 return {explicit_env_proxy:true,tls_verification:true};
}
