// Explicit offline binding only; never calls a remote tool or modifies served files.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {render,root,sha,cutoffToken} from './candidate.mjs';
const [cutoff,output]=process.argv.slice(2);
if(!cutoff||cutoff===cutoffToken||!output)throw Error('Usage: node bind.mjs OWNER_APPROVED_CANONICAL_UTC NEW_TMP_DIRECTORY');
const dir=resolve(output);if(!dir.startsWith('/tmp/'))throw Error('Only a new /tmp directory is allowed');
const hashes=JSON.parse(await readFile(new URL('hashes.json',root),'utf8'));
for(const [name,hash]of Object.entries(hashes))if(sha(await readFile(new URL(name,root)))!==hash)throw Error('Candidate hash drift: '+name);
const m=JSON.parse(await readFile(new URL('manifest.json',root),'utf8'));
const bound={...m,cutoff,state:'BOUND_CANDIDATE_NOT_REMOTE_AUTHORIZATION'};const pack=await render(bound,{cutoff});await mkdir(dir);const out={};
for(const [name,bytes]of [['opening.sql',pack.opening],['cleanup.sql',pack.cleanup],['preview-open-config.mjs',pack.openConfig],['preview-closed-config.mjs',pack.closedConfig],['manifest.json',JSON.stringify(bound,null,2)+'\n']]){await writeFile(resolve(dir,name),bytes);out[name]=sha(bytes);}
for(const name of ['v2-payload.json','preflight.sql','postflight.sql']){const bytes=await readFile(new URL(name,root));await writeFile(resolve(dir,name),bytes);out[name]=sha(bytes);}
await writeFile(resolve(dir,'hashes.json'),JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({cutoff,output:dir,hashes:out},null,2));
