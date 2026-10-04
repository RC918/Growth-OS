// Reuses real owned site GETs and the unmodified scanner/parser; no cached URL response.
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
export async function scanOwnedSite(site,database){
 if(site.targetURL!=='https://rc-source.example/bolt/')throw Error('Isolated source binding required');
 const observed=[];
 const bridge=createServer(async(req,res)=>{
  if(req.method!=='GET'||!['/robots.txt','/bolt/'].includes(req.url)){res.writeHead(403);res.end();return;}
  try{const r=await site.call(req.url,{authenticated:false});observed.push({path:req.url,status:r.status,hash:createHash('sha256').update(r.text).digest('hex')});res.writeHead(r.status,{'content-type':req.url==='/robots.txt'?'text/plain':'text/html'});res.end(r.text);}catch{res.writeHead(502);res.end();}
 });
 await new Promise(r=>bridge.listen(0,'127.0.0.1',r));
 try{
  const child=spawn('python3',['-B',new URL('./network-fixture.py',import.meta.url).pathname],{stdio:['pipe','pipe','pipe']});let out='',err='';child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>err+=b);
  child.stdin.end(JSON.stringify({url:site.targetURL,bridge:'http://127.0.0.1:'+bridge.address().port,database}));
  await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error('Source fixture failed: '+err.slice(-1500))));});
  const report=JSON.parse(out);if(observed.length!==2||observed[0].path!=='/robots.txt'||report.snapshot.content_fingerprint!=='sha256:'+observed[1].hash||!report.preview)throw Error('Actual source bytes / parser mismatch');
  return report;
 }finally{bridge.closeAllConnections();await new Promise(r=>bridge.close(r));}
}
