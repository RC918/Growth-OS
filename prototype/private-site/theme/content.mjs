// Read approved draft text into an exact, reviewable package. No runtime provisioning.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
export async function content(){
 const pages=[];
 for(const slug of ['growth-os','about','privacy']){
  const source='docs/pilot-content/'+slug+'.md',text=await readFile(source,'utf8');
  const sections=text.split('\n---')[0].split(/^## /m).slice(1).map(s=>{const [heading,...rest]=s.trim().split('\n');return {heading,blocks:rest.join('\n').trim().split(/\n\s*\n/).filter(Boolean).map(b=>b.startsWith('- ')?{list:b.split('\n').map(x=>x.slice(2))}:{paragraph:b.replace(/\n/g,' ')})};});
  const title=/^搜尋標題：(.+)$/m.exec(text)?.[1],description=/^搜尋摘要：(.+)$/m.exec(text)?.[1];if(!title||!description||!sections.length)throw Error('Draft structure changed');
  const product=slug==='growth-os';const lead=product?sections[0].blocks.shift().paragraph:null;
  pages.push({slug,path:'/'+slug+'/',kind:product?'product':'control',title,meta_description:description,product_name:product?'Growth OS':null,description:lead,sections,source,source_sha256:createHash('sha256').update(text).digest('hex')});
 }
 return {format:1,public_ready:false,operator:{name:'古德茉莉科技股份有限公司',english_name:'Good Morning Digital Co., Ltd.',email:'hello@gmdgrowth.com',candidate_domain:'gmdgrowth.com'},blockers:['retention_and_deletion','actual_smtp_analytics_third_parties','actual_logs_and_data_flows','rights_and_effective_date','public_deployment_approval'],pages};
}
if(process.argv[1]===new URL(import.meta.url).pathname)await writeFile(new URL('./content.json',import.meta.url),JSON.stringify(await content(),null,2)+'\n');
