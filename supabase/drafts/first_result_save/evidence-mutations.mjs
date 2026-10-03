// Same producer-schema deletion/type cases as the accepted pure contract; no test imports.
export function evidenceMutations(){
  const cases=[];
  function required(path,invalid){
    cases.push([path.join('.')+' deleted',r=>{let node=r;for(const key of path.slice(0,-1))node=node[key];delete node[path.at(-1)];}]);
    for(const value of invalid)cases.push([path.join('.')+' = '+JSON.stringify(value),r=>{let node=r;for(const key of path.slice(0,-1))node=node[key];node[path.at(-1)]=value;}]);
  }
  required(['inferences'],[null,{},[],['untyped']]);required(['missing'],[null,{},[],[42],['']]);
  required(['preview','pending_confirmation'],[null,{},[],[42],['']]);
  required(['facts','features'],[null,{},['untyped']]);
  for(const key of ['product_name','title','meta_description','description','use']){
    required(['facts',key],[42,'untyped',[],{kind:'inference',value:'wrong type',citations:['s1']}]);
  }
  for(const key of ['kind','verification','value','citations'])required(['facts','title',key],[null,42]);
  required(['facts','title','kind'],['inference']);required(['facts','title','verification'],['verified']);
  for(const key of ['kind','value','basis','citations'])required(['inferences',0,key],[null,42]);
  required(['inferences',0,'kind'],['fact']);
  required(['page_type'],[null,'not_supported_product']);required(['extraction'],[null,{}]);
  required(['extraction','method'],[null,42]);required(['extraction','limitations'],[null,[],[42]]);
  required(['snapshot','limitations'],[null,[],[42]]);required(['preview','generation'],[null,42]);
  required(['preview','fields','title','reason'],[null,42]);
  required(['facts','description','product_scope'],[null,{}]);
  for(const key of ['locator','name_locator','product_name'])required(['facts','description','product_scope',key],[null,42]);
  cases.push(['typed feature required',r=>r.facts.features=[{kind:'inference',value:'bad',citations:['s1']}]]);
  cases.push(['missing/pending agreement',r=>r.preview.pending_confirmation.pop()]);
  cases.push(['required unknown omitted from both',r=>{r.missing=r.missing.filter(x=>x!=='price');r.preview.pending_confirmation=r.preview.pending_confirmation.filter(x=>x!=='price');}]);
  return cases;
}
