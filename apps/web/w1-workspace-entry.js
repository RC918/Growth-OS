// Independent of the module graph: a failed import must leave sending disabled.
(function () {
 var stage='載入';
 function failed() {
  document.getElementById('send-link').disabled=true;
  document.getElementById('auth-status').textContent=stage==='載入'
   ?'登入元件載入失敗，無法寄送。請停止操作並回報；本頁不會自動寄送或重試。'
   :'登入介面初始化失敗，無法寄送。請停止操作並回報；本頁不會自動寄送或重試。';
 }
 import('./product-fact.mjs').then(function (module) {
  stage='初始化';
  return module.startWorkspace();
 }).catch(failed);
}());
