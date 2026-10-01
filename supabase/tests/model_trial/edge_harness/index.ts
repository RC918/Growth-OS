// Isolated CI dispatcher. No gateway/JWT bypass setting is changed in production.
// Explicit empty worker environment: no local/platform credentials are forwarded.
Deno.serve(async request => {
 try {
  const worker=await EdgeRuntime.userWorkers.create({
   servicePath:'/fixture/supabase/functions/growth-model-trial',
   maybeEntrypoint:'file:///fixture/supabase/functions/growth-model-trial/index.js',
   memoryLimitMb:150,workerTimeoutMs:10000,envVars:[],forceCreate:true,noModuleCache:true,
  });
  const reply=await worker.fetch(request);
  const headers=new Headers(reply.headers);headers.set('x-test-user-worker','loaded');
  return new Response(reply.body,{status:reply.status,headers});
 } catch {
  // A boot/import error must fail the test, never masquerade as gate-closed 503.
  return Response.json({code:'EDGE_BOOT_FAILED'},{status:500});
 }
});
