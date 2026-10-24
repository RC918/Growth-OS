// Exact character comparison; never claims semantic improvement or source support.
function updateFieldDifferences(view,report){
 for(const key of reviewFields){
  const root=document.querySelector('[data-diff-field="'+key+'"]');if(!root)continue;
  const before=report.preview.fields[key].original||'',after=view.fields[key];
  if(root._before===before&&root._after===after)continue;root._before=before;root._after=after;
  root.replaceChildren();const heading=make('p',before===after?'與來源原文相同':'文字差異 · 刪除／新增');heading.className='difference-label';root.append(heading);
  if(before===after)continue;
  const a=Array.from(before),b=Array.from(after);let start=0,end=0;
  while(start<a.length&&start<b.length&&a[start]===b[start])start++;
  while(end<a.length-start&&end<b.length-start&&a[a.length-1-end]===b[b.length-1-end])end++;
  const comparison=make('p');comparison.className='difference-text';comparison.append(document.createTextNode(a.slice(0,start).join('')));
  const removed=a.slice(start,a.length-end).join(''),added=b.slice(start,b.length-end).join('');
  if(removed){const del=make('del',removed);del.setAttribute('aria-label','刪除：'+removed);comparison.append(del);}
  if(added){const ins=make('ins',added);ins.setAttribute('aria-label','新增：'+added);comparison.append(ins);}
  comparison.append(document.createTextNode(end?a.slice(a.length-end).join(''):''));root.append(comparison);
 }
}
