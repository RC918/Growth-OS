// Flatten pinned upstream ESM files without rewriting parser semantics.
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,relative,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
export async function htmlParserSources(){
 const packages={parse5:'7.3.0',entities:'6.0.1'},out=new Map();
 for(const [name,version]of Object.entries(packages))if(JSON.parse(await readFile(resolve(root,'node_modules',name,'package.json'))).version!==version)throw Error('HTML_PARSER_VERSION_DRIFT:'+name);
 const nameFor=path=>'source-html-'+relative(resolve(root,'node_modules'),path).replace(/\/dist\/(?:esm\/)?/,'/').replace(/\.js$/,'').replaceAll('/','-')+'.mjs';
 async function visit(path){
  const name=nameFor(path);if(out.has(name))return name;out.set(name,'');
  let source=await readFile(path,'utf8');
  const imports=[...source.matchAll(/\b(?:from\s*|import\s*)(['"])([^'"]+)\1/g)];
  for(const match of imports){const spec=match[2];const dep=spec==='entities/decode'?resolve(root,'node_modules/entities/dist/esm/decode.js'):spec.startsWith('.')?resolve(dirname(path),spec):null;
   if(!dep||!dep.startsWith(resolve(root,'node_modules')+'/')||!dep.endsWith('.js'))throw Error('Unexpected parser import '+spec);
   const target=await visit(dep);source=source.replaceAll(match[1]+spec+match[1],match[1]+'./'+target+match[1]);
  }
  source=source.replace(/^\/\/# sourceMappingURL=.*$/gm,'');
  out.set(name,'// Generated from pinned '+relative(resolve(root,'node_modules'),path)+'; see source-html-licenses.txt.\n'+source);return name;
 }
 await visit(resolve(root,'node_modules/parse5/dist/parser/index.js'));
 let licenses='Pinned HTML parser: parse5 7.3.0 (https://github.com/inikulin/parse5), entities 6.0.1 (https://github.com/fb55/entities).\nOnly module import paths and source-map comments are changed.\n';
 for(const name of Object.keys(packages))licenses+='\n'+name+'\n'+await readFile(resolve(root,'node_modules',name,'LICENSE'),'utf8');
 out.set('source-html-licenses.txt',licenses);return out;
}
export async function buildHTMLParser(){const out=await htmlParserSources();for(const [name,source]of out)await writeFile(resolve(root,'apps/web',name),source);return [...out.keys()];}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log('Pinned HTML parser files: '+(await buildHTMLParser()).length);
