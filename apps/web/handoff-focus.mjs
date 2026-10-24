// An asynchronous handoff may finish after the user started another action.
// Announce through the existing status; move focus only out of the idle/login UI.
export function focusHandoffResult({document,root,title}){
 if(!root.isConnected||root.hidden||!title.isConnected)return false;
 const active=document.activeElement;
 if(active!==document.body&&!active?.closest('#sign-in'))return false;
 title.tabIndex=-1;title.focus();return true;
}
