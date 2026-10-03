// Expected format decisions from the accepted JS URL parser; no DNS or requests.
export const urlCases=[
 ['https://example.com/',true],['https://example.com:443/p',true],['https://example.com:65535/p',true],['https://example.com:0/',true],
 ['https://example.com:/',true],['https://example.com:000443/',true],['https://v/',true],['HTTPS://EXAMPLE.COM/p',true],
 ['https://[::1]/',true],['https://[2001:db8::1]:8443/p',true],['https://[::ffff:192.0.2.1]/',true],
 ['https://127.0.0.1/',true],['https://127.1/',true],['https://0x7f.1/',true],['https://2130706433/',true],
 ['https://xn--bcher-kva.example/',true],['https://bücher.example/',true],['https://%65xample.com/',true],
 ['https://example.com/path@label',true],['https://@example.com/',true],['https://:@example.com/',true],
 ['https:/example.com/',true],['https:example.com/',true],['https://example.com/?#',true],
 ['https://:/',false],['https://:443/',false],['https://example.com:99999/',false],['https://example.com:65536/',false],
 ['https://example.com:-1/',false],['https://example.com:abc/',false],['https://example.com:80:90/',false],
 ['https://[invalid]/',false],['https://[::1',false],['https://[::1]extra/',false],['https://[::1]:99999/',false],
 ['https://::1/',false],['https://256.1.1.1/',false],['https://127.0.0.999/',false],['https://1.2.3.4.5/',false],['https://example.123/',false],
 ['https://example%3A.com/',false],['https://example%ZZ.com/',false],['https://example%FF.com/',false],
 ['https://example.com\u000B/',false],['https://example.com\uFEFF/',false],['https://user@example.com/',false],
 ['https://user:pass@example.com/',false],['https:///',false],['http://example.com/',false],['https://example.com/?q=1',false],['https://example.com/#fragment',false],
];
export function jsURLAllowed(value){
 if(typeof value!=='string'||value.length>2048||/[\s\\]/u.test(value))return false;
 try{const u=new URL(value);return u.protocol==='https:'&&!!u.hostname&&!u.username&&!u.password&&!u.search&&!u.hash;}catch{return false;}
}
export async function rebind(report,url,digest){
 const r=structuredClone(report),s=r.snapshot,v=r.review;
 s.original_url=url;s.final_url=url;for(const c of s.citations)c.url=url;
 v.original_url=url;v.final_url=url;
 const {original_url,final_url,snapshot_id,source_version,revision}=v;
 const fields=Object.fromEntries(['title','meta_description','description'].map(k=>[k,r.preview.fields[k].suggested]));
 v.content_digest=await digest(JSON.stringify({schema_version:1,original_url,final_url,snapshot_id,source_version,revision,fields}));
 if(v.confirmation){v.confirmation.original_url=url;v.confirmation.final_url=url;v.confirmation.content_digest=v.content_digest;}
 return r;
}
