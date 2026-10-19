// Derived-preview cross-tab handoff bridge (build-time only, dist output).
// Problem: the Magic Link email opens a NEW tab whose opener is null and
// whose login token lives only in that tab's memory, so the same-origin
// postMessage handoff from the First Result tab can never reach it.
// Bridge: the First Result tab also stashes the reviewed payload in
// same-origin localStorage (30 min, one-time nonce); any same-origin
// Workspace tab claims it after login through the existing accept() path,
// which fully re-validates the payload. No credentials are ever stashed.
// Frozen sources are never modified; anchors fail loud on drift.
import {readFile, writeFile} from 'node:fs/promises';

const KEY = 'growth-os:pending-handoff:v1';
const MARK = '/*handoff-bridge:v1*/';

export async function applyHandoffBridge(distDir) {
  const handoffPath = new URL('first-result-handoff.mjs', distDir);
  const savePath = new URL('url-result-save.mjs', distDir);
  let handoff = await readFile(handoffPath, 'utf8');
  let save = await readFile(savePath, 'utf8');
  if (handoff.includes(MARK) && save.includes(MARK)) return {applied: false, reason: 'already patched'};
  if (handoff.includes(MARK) !== save.includes(MARK)) throw Error('handoff bridge partial patch state');
  const stash = `try{localStorage.setItem('${KEY}',JSON.stringify({nonce:operation.nonce,payload:operation.payload,saved_at:Date.now()}))}catch{};`;
  const anchorSend = 'try{operation.payload=await review.export();invalidate();send(operation);}';
  if (!handoff.includes(anchorSend)) throw Error('handoff anchor drift: export/send');
  handoff = handoff.replace(anchorSend, `try{operation.payload=await review.export();${stash}invalidate();send(operation);}`);
  const anchorCancel = 'function cancel(){if(pending){';
  if (!handoff.includes(anchorCancel)) throw Error('handoff anchor drift: cancel');
  handoff = handoff.replace(anchorCancel, `function cancel(){try{localStorage.removeItem('${KEY}')}catch{};if(pending){`);
  const claim = `if(!payload){try{const stash=JSON.parse(localStorage.getItem('${KEY}')||'null');const valid=stash&&typeof stash.nonce==='string'&&stash.payload&&Number.isFinite(stash.saved_at);const expired=valid&&Date.now()-stash.saved_at>=1800000;if(valid&&!expired&&!used.has(stash.nonce)){used.add(stash.nonce);transfer=stash.nonce;const own=++ticket;accept(stash.payload,stash.nonce,own).then(ok=>{if(ok){try{localStorage.removeItem('${KEY}')}catch{}}}).catch(()=>{});}else if(!valid||expired){try{localStorage.removeItem('${KEY}')}catch{}}}catch{}}`;
  const anchorOpen = "if(trial){void probeTrial()";
  if (!save.includes(anchorOpen)) throw Error('save anchor drift: open');
  save = save.replace(anchorOpen, `${claim}\n   if(trial){void probeTrial()`);
  await writeFile(handoffPath, handoff + '\n' + MARK + '\n');
  await writeFile(savePath, save + '\n' + MARK + '\n');
  return {applied: true};
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dist = new URL('./dist/', import.meta.url);
  console.log(JSON.stringify(await applyHandoffBridge(dist)));
}
