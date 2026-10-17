// Independent of the module graph: a failed import must leave sending disabled.
(function () {
 var stage='載入';
 // Emit only fixed categories: raw browser errors can contain URLs or credentials.
 function failureReason(error) {
  if(stage!=='載入')return 'INIT：介面啟動未完成';
  if(error&&error.name==='SyntaxError')return 'MODULE_SYNTAX：元件語法或匯出不相容';
  if(error&&error.name==='TypeError'&&/Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(error.message||''))return 'MODULE_LOAD：瀏覽器未能讀取元件（連線、內容類型或載入限制）';
  if(error&&error.name==='ReferenceError')return 'MODULE_REFERENCE：元件執行時缺少定義';
  return 'MODULE_EXECUTION：元件執行未完成，需核對部署內容';
 }
 function failed(error) {
  document.getElementById('send-link').disabled=true;
  document.getElementById('auth-status').textContent=(stage==='載入'
   ?'登入元件載入失敗，無法寄送。請停止操作並回報；本頁不會自動寄送或重試。'
   :'登入介面初始化失敗，無法寄送。請停止操作並回報；本頁不會自動寄送或重試。')+' 錯誤分類：'+failureReason(error)+'。';
 }
 // A hung module request never settles the import promise; bound the wait so
 // the page reports a classified failure instead of initializing forever.
 var settled=false;
 var timer=setTimeout(function () {
  if(settled)return; settled=true;
  var error=new Error('Failed to fetch dynamically imported module: timeout');
  error.name='TypeError'; failed(error);
 }, 15000);
 import('./product-fact.mjs').then(function (module) {
  stage='初始化';
  return module.startWorkspace();
 }).then(function () { settled=true; clearTimeout(timer); }, function (error) {
  if(settled)return; settled=true; clearTimeout(timer); failed(error);
 });
}());
