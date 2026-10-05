// Explicit offline binding only. Never changes served files or contacts remote.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {root,sha,render,cutoffToken,artifactNames} from './candidate.mjs';
const [cutoff,output]=process.argv.slice(2);
if(!cutoff||cutoff===cutoffToken||!output)throw Error('Usage: node bind.mjs OWNER_APPROVED_CANONICAL_UTC NEW_TMP_DIRECTORY');
const dir=resolve(output);if(!dir.startsWith('/tmp/'))throw Error('Only a new /tmp directory is allowed');
const hashes=JSON.parse(await readFile(new URL('hashes.json',root),'utf8'));for(const name of artifactNames)if(sha(await readFile(new URL(name,root)))!==hashes[name])throw Error('Candidate hash drift: '+name);
const m=JSON.parse(await readFile(new URL('manifest.json',root),'utf8')),bound={...m,cutoff,state:'BOUND_CANDIDATE_NOT_REMOTE_AUTHORIZATION'},p=await render(bound,{cutoff});await mkdir(dir);const out={};
for(const [name,bytes]of [['manifest.json',JSON.stringify(bound,null,2)+'\n'],['opening.sql',p.opening],['cleanup.sql',p.cleanup],['preview-open-config.mjs',p.openConfig],['preview-closed-config.mjs',p.closedConfig],['state.sql',p.state],...['preflight.sql','postflight.sql','readback.sql','preservation.sql'].map(n=>[n,null])]){
 const data=bytes??await readFile(new URL(name,root));await writeFile(resolve(dir,name),data);out[name]=sha(data);
}
await writeFile(resolve(dir,'hashes.json'),JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({output:dir,cutoff,hashes:out},null,2));
