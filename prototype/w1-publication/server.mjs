import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=new URL('../../',import.meta.url);
const allowed=new Set(['index.html','preview.css','preview.mjs','fixture.mjs'].map(f=>'/prototype/w1-publication/'+f).concat(['first-result.css','url-publish-preview.mjs','w1-workspace-api.mjs','w1-publication-preview.mjs','r7-workspace-api.mjs','intro-save.mjs','intro-r7-review.mjs','intro-candidate.mjs'].map(f=>'/apps/web/'+f)));
allowed.add('/delivery/w1-private/dist/url-publish-preview.mjs');
export async function startPreviewServer(port=0){
 const server=createServer(async(req,res)=>{const path=new URL(req.url,'http://localhost').pathname;
  if(req.method!=='GET'){res.writeHead(405);return res.end();}
  if(path==='/'){res.writeHead(302,{location:'/prototype/w1-publication/index.html'});return res.end();}
  if(!allowed.has(path)){res.writeHead(404);return res.end();}
  try{res.writeHead(200,{'content-type':path.endsWith('.mjs')?'text/javascript':path.endsWith('.css')?'text/css':'text/html','cache-control':'no-store'});res.end(await readFile(new URL('.'+path,root)));}catch{res.writeHead(500);res.end();}
 });await new Promise(resolve=>server.listen(port,'127.0.0.1',resolve));return {origin:'http://127.0.0.1:'+server.address().port,close:()=>new Promise(resolve=>server.close(resolve))};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const server=await startPreviewServer(Number(process.env.W2_PREVIEW_PORT||4312));console.log('Synthetic readonly preview: '+server.origin+'/prototype/w1-publication/index.html');}
