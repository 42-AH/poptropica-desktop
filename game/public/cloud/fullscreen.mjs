const view=document.getElementById('game-view');
const button=document.getElementById('fullscreen');
let expanded=false,wasNative=false,generation=0;
const inertBefore=new Map();
const nativeElement=()=>document.fullscreenElement||document.webkitFullscreenElement;
function setExpanded(value) {
  expanded=value;
  view.classList.toggle('expanded',value);
  document.documentElement.classList.toggle('game-expanded',value);
  button.setAttribute('aria-pressed',String(value));
  button.textContent=value?(nativeElement()===view?'Exit fullscreen':'Exit expanded view'):'Fullscreen';
  if(value) {
    for(const element of document.querySelectorAll('body > header, main > :not(#game-view)')) {
      if(!inertBefore.has(element))inertBefore.set(element,element.inert);
      element.inert=true;
    }
  } else {
    for(const [element,previous] of inertBefore)element.inert=previous;
    inertBefore.clear();
  }
}
async function leaveNative() {
  if(nativeElement()!==view)return;
  try {await (document.exitFullscreen||document.webkitExitFullscreen)?.call(document);}catch { /* Exit control remains available if the browser refuses. */ }
}
export function exitExpandedPlayer() {
  generation++;
  setExpanded(false);
  void leaveNative();
}
button.addEventListener('click',async()=>{
  if(expanded) {exitExpandedPlayer();button.focus({preventScroll:true});return;}
  const attempt=++generation;
  setExpanded(true);
  const request=view.requestFullscreen||view.webkitRequestFullscreen;
  if(request) {
    try {await request.call(view);}catch { /* Keep the expanded page layout on unsupported or denied fullscreen. */ }
  }
  if(attempt!==generation) {await leaveNative();return;}
  setExpanded(true);
});
function fullscreenChanged() {
  const active=nativeElement()===view;
  if(active)setExpanded(true);
  else if(wasNative) {generation++;setExpanded(false);button.focus({preventScroll:true});}
  wasNative=active;
}
document.addEventListener('fullscreenchange',fullscreenChanged);
document.addEventListener('webkitfullscreenchange',fullscreenChanged);
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&expanded)exitExpandedPlayer();});
