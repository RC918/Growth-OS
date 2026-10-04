// Pending approved environment only; exact loopback health endpoint, no fallback.
for(let n=0;;n++){try{const r=await fetch('http://127.0.0.1:8792/health',{signal:AbortSignal.timeout(500)});if(r.ok&&(await r.json()).run==='growth-internal-rc-01')break;}catch{}if(n>=40)throw Error('RC service not ready');await new Promise(r=>setTimeout(r,250));}
