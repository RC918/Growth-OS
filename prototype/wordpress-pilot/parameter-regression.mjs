import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {createSite} from '../wordpress-publish/site.mjs';
if(process.argv.slice(2).join(' ')!=='--mode growth-os-isolated-regression')throw Error('Explicit isolated mode required');
const site=await createSite({pilotFixture:true,parameterFixture:true});
try{
 const before=site.snapshot(),control=site.controlSnapshot(),page=(await site.call(site.path(site.target))).json();
 const body={title:page.title.raw,content:page.content.raw,meta:{growth_meta_description:page.meta.growth_meta_description}};
 const headers={'x-growth-before':page.growth_revision};const results=[];
 const queryValues={excerpt:'changed',slug:'changed',status:'draft',author:String(site.user),parent:String(site.control),menu_order:'7',template:'',featured_media:'0',comment_status:'open',ping_status:'open',date:'2026-10-05T00:00:00',id:String(site.control),title:'changed',content:'changed','meta[growth_meta_description]':'changed','meta[extra]':'changed'};
 const cases=[
  ...Object.entries(queryValues).map(([k,v])=>({name:'query '+k,path:site.path(site.target)+'&'+encodeURIComponent(k)+'='+encodeURIComponent(v),body,headers})),
  ...['default','url','form','file'].map(source=>({name:'native injected '+source,body,headers:{...headers,'x-growth-fixture-source':source}})),
  {name:'extra JSON field',body:{...body,excerpt:'changed'},headers},
  {name:'JSON nested extra meta',body:{...body,meta:{...body.meta,extra:'changed'}},headers},
  {name:'form-urlencoded',rawBody:'title=x&content=y&meta%5Bgrowth_meta_description%5D=z&excerpt=changed',headers:{...headers,'content-type':'application/x-www-form-urlencoded'}},
  {name:'multipart',rawBody:'--test\r\nContent-Disposition: form-data; name="excerpt"\r\n\r\nchanged\r\n--test--\r\n',headers:{...headers,'content-type':'multipart/form-data; boundary=test'}},
  {name:'text/plain JSON',rawBody:JSON.stringify(body),headers:{...headers,'content-type':'text/plain'}},
  {name:'vendor JSON',rawBody:JSON.stringify(body),headers:{...headers,'content-type':'application/problem+json'}},
  {name:'malformed JSON',rawBody:'{"title":',headers:{...headers,'content-type':'application/json'}},
  {name:'query context array',path:site.path(site.target)+'&context%5Bx%5D=edit',body,headers},
  {name:'control target',path:site.path(site.control),body,headers}
 ];
 for(const c of cases){assert.equal(site.attempts(),0,'every denial precedes any consumed attempt');const r=await site.call(c.path??site.path(site.target),{method:'POST',...c});assert.ok([400,403,415].includes(r.status),c.name+' '+r.status+' '+r.text);assert.notEqual(r.json().code,'attempts');assert.deepEqual(site.snapshot(),before,c.name+' target/control full pages and metadata');assert.deepEqual(site.controlSnapshot(),control);assert.equal(site.attempts(),0,c.name+' budget unchanged');results.push({name:c.name,status:r.status,code:r.json().code,attempts:0});}
 // Read routes also reject update params; native defaults/context still permit normal GET.
 const denied=await site.call(site.path(site.target)+'&excerpt=changed');assert.equal(denied.status,403);assert.equal(denied.json().code,'parameter_sources');assert.equal(site.attempts(),0);
 const afterText={title:'Legal change',content:'<p>Legal description.</p>',meta:{growth_meta_description:'Legal meta'}};
 const publish=await site.call(site.path(site.target),{method:'POST',body:afterText,headers:{...headers,'content-type':'application/json; charset=UTF-8'}});assert.equal(publish.status,200,publish.text);assert.equal(site.attempts(),1);assert.equal(publish.json().excerpt.raw,page.excerpt.raw);
 const restore=await site.call(site.path(site.target),{method:'POST',body,headers:{'x-growth-before':publish.json().growth_revision}});assert.equal(restore.status,200,restore.text);assert.equal(site.attempts(),2);
 const after=site.snapshot();for(const row of after.posts){const old=before.posts.find(p=>p.ID===row.ID);for(const k of Object.keys(row))if(!['post_modified','post_modified_gmt'].includes(k))assert.deepEqual(row[k],old[k],k);}assert.deepEqual(after.meta,before.meta);assert.deepEqual(site.controlSnapshot(),control);
 const report={...(await site.proof()),cases:results,negative_attempts:0,successful_posts:2,normal_publish_restore:true,before,after,control_before:control,control_after:site.controlSnapshot()};
 writeFileSync('/tmp/'+site.run+'-parameter-proof.json',JSON.stringify(report,null,2)+'\n');console.log('PASS parameter sources: '+results.length+' denied while attempt=0; exact full snapshot unchanged; normal JSON publish/restore 200 (2 attempts); evidence /tmp/'+site.run+'-parameter-proof.json');
}finally{await site.close();}
