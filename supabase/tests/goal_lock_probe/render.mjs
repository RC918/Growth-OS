import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
export function renderProbe(sql,start) {
 const ms=Date.parse(start);
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(start)||!Number.isFinite(ms))
  throw new Error('Exact UTC approved start required; no default or relative date');
 if(new Date(ms).toISOString()!==start.replace(/(?<!\.\d{3})Z$/,'.000Z'))
  throw new Error('Start must be an actual UTC calendar timestamp');
 return sql.replaceAll('__PROBE_START__',new Date(ms).toISOString())
  .replaceAll('__PROBE_DEADLINE__',new Date(ms+2*60*60*1000).toISOString());
}
if(process.argv[1]===new URL(import.meta.url).pathname) {
 const [start,out]=process.argv.slice(2);
 if(!start||!out)throw new Error('Usage: node render.mjs EXACT_APPROVED_START_UTC OUTPUT_DIR (offline only)');
 // Only writes review artifacts. Never connects/applies/enables a login.
 const directory=resolve(out);await mkdir(directory,{recursive:true});
 for(const name of ['create.sql.template','activate.sql.template','verify.sql','cleanup.sql']) {
  const source=await readFile(new URL(name,import.meta.url),'utf8');
  await writeFile(resolve(directory,name.replace('.template','')),renderProbe(source,start));
 }
 await writeFile(resolve(directory,'window.json'),JSON.stringify({start:new Date(Date.parse(start)).toISOString(),
  deadline:new Date(Date.parse(start)+7200000).toISOString(),reviewOnly:true},null,2));
 console.log('Offline review SQL written; no database action performed.');
}
