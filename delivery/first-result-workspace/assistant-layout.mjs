// Presentation only: no API, focus, confirmation or persistence operations.
export function createAssistantLayout({document:doc=globalThis.document,view=globalThis}={}){
 const rail=doc.querySelector('.rail'),guide=doc.getElementById('guidance'),task=doc.getElementById('task-card');
 let signature='',natural=false;
 const number=value=>Number.parseFloat(value)||0;
 const vertical=(style,keys)=>keys.reduce((total,key)=>total+number(style[key]),0);
 return {refresh(){
  const rem=number(view.getComputedStyle(doc.documentElement).fontSize);
  const next=[view.innerWidth,view.innerHeight,rem].join(':');
  if(next!==signature){signature=next;natural=false;rail.classList.remove('assistant-natural');}
  if(view.innerWidth<768||guide.hidden){natural=false;rail.classList.remove('assistant-natural');return;}
  // Within one viewport/font size, only relax the constraint. A shorter guide
  // cannot repeatedly re-enable the constraint via ResizeObserver callbacks.
  if(natural)return;
  const railStyle=view.getComputedStyle(rail),guideStyle=view.getComputedStyle(guide),taskStyle=view.getComputedStyle(task);
  const required=guide.scrollHeight+task.scrollHeight+
   vertical(guideStyle,['borderTopWidth','borderBottomWidth','marginTop','marginBottom'])+
   vertical(taskStyle,['borderTopWidth','borderBottomWidth','marginTop','marginBottom'])+
   vertical(railStyle,['paddingTop','paddingBottom','borderTopWidth','borderBottomWidth','rowGap']);
  if(required>view.innerHeight-2*rem+1){natural=true;rail.classList.add('assistant-natural');}
 }};
}
