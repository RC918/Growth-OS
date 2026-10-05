// Called at the HTTP receiver, not at the caller: retain only JSON field names.
// Never retain the request body, authorization headers or credential values.
export function observeRequestKeys(req,record){
 if(req.method!=='POST')return;
 let size=0,parts=[];
 req.on('data',b=>{size+=b.length;if(size<=100000)parts.push(b);else parts=[];});
 req.on('end',()=>{try{
  if(size>100000)throw Error('limit');const body=JSON.parse(Buffer.concat(parts).toString());
  const keys=Object.keys(body).sort(),meta_keys=body.meta&&typeof body.meta==='object'?Object.keys(body.meta).sort():[];
  const allowed=['content','meta','title','growth_meta_description'];
  record({method:'POST',keys:keys.map(k=>allowed.includes(k)?k:'[unexpected]'),meta_keys:meta_keys.map(k=>allowed.includes(k)?k:'[unexpected]')});
 }catch{record({method:'POST',invalid_body:true});}});
}
