// No host SQL bind mount, secret interpolation, shell, or retry of the role mutation.
export async function bootstrapDatabase({docker,checkWindow,pause,root,prefix,sql}) {
 docker(['compose','-f',root+'/compose.json','up','-d','db']);
 // The image's temporary initialization server is socket-only. Wait for final TCP readiness.
 let ready=false;
 for(let i=0;i<80;i++){
  checkWindow();
  try{docker(['exec','--user','postgres',prefix+'-db','pg_isready','-h','127.0.0.1','-U','postgres']);ready=true;break;}catch{}
  await pause();
 }
 if(!ready)throw Error('Native PostgreSQL not ready; no bootstrap was submitted');
 checkWindow();
 docker(['exec','-i','--user','postgres',prefix+'-db','psql','-X','-q','-w','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],sql);
 // Auth cannot migrate before its database role/schema exist.
 docker(['compose','-f',root+'/compose.json','up','-d']);
}
