// One explicit transfer to a specific same-origin workspace window. Never sends credentials.
export function createResultHandoff({button,cancelButton,getReview,isBusy,report}) {
 let pending=null;
 function send(p){if(pending===p&&p.ready&&p.payload&&!p.sent&&!p.peer.closed){p.sent=true;p.peer.postMessage({type:'url-result-offer',nonce:p.nonce,payload:p.payload},location.origin);}}
 function cancel(){if(pending){pending.peer?.postMessage({type:'url-result-cancel',nonce:pending.nonce},location.origin);pending=null;}cancelButton.hidden=true;}
 function invalidate(){if(pending&&(pending.review!==getReview()||pending.token!==getReview()?.view().token))cancel();}
 button.addEventListener('click',async()=>{
  const review=getReview();if(!review||isBusy())return;cancel();
  const operation={review,token:review.view().token,nonce:crypto.randomUUID(),peer:window.open('./workspace.html','_blank'),sent:false,ready:false,payload:null};
  if(!operation.peer){report('請允許開啟工作區，或匯出成果 JSON 後在工作區匯入。');return;}
  pending=operation;cancelButton.hidden=false;report('原成果保留於此頁。請在工作區登入後核對保存；若登入開啟另一分頁，可改用匯出／匯入。');
  try{operation.payload=await review.export();invalidate();send(operation);}catch{if(pending===operation){cancel();report('成果已變更，請重新交接目前版本。');}}
 });
 window.addEventListener('message',event=>{
  invalidate();const p=pending;if(!p||event.origin!==location.origin||event.source!==p.peer||p.peer.closed)return;
  if(event.data?.type==='url-result-ready'){p.ready=true;send(p);}
  if(event.data?.type==='url-result-accepted'&&event.data.nonce===p.nonce)report('已交接完整成果；請在工作區核對並確認保存，尚未自動保存。');
 });
 cancelButton.addEventListener('click',()=>{cancel();report('已取消交接；本頁成果仍保留。');});
 window.addEventListener('pagehide',cancel);
 return {invalidate,cancel};
}
