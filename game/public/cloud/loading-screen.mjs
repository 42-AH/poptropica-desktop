// Original Flash letter faces, outlines, and extrusions; browser-composited movement.
const layout = [{"id": 1, "x": 338, "y": 261, "width": 44, "height": 59}, {"id": 2, "x": 368, "y": 275, "width": 37, "height": 41}, {"id": 3, "x": 397, "y": 269, "width": 39, "height": 51}, {"id": 4, "x": 424, "y": 249, "width": 33, "height": 55}, {"id": 5, "x": 449, "y": 270, "width": 35, "height": 40}, {"id": 6, "x": 476, "y": 271, "width": 37, "height": 41}, {"id": 7, "x": 505, "y": 264, "width": 39, "height": 51}, {"id": 8, "x": 539, "y": 250, "width": 26, "height": 56}, {"id": 9, "x": 553, "y": 271, "width": 36, "height": 42}, {"id": 10, "x": 579, "y": 277, "width": 40, "height": 43}, {"id": 11, "x": 621, "y": 280, "width": 9, "height": 10}, {"id": 12, "x": 445, "y": 338, "width": 10, "height": 10}, {"id": 13, "x": 460, "y": 338, "width": 10, "height": 10}, {"id": 14, "x": 475, "y": 338, "width": 10, "height": 10}, {"id": 15, "x": 490, "y": 338, "width": 10, "height": 10}, {"id": 16, "x": 505, "y": 338, "width": 10, "height": 10}];
// Original loading-letter spring constants; the CSS idle wave remains independent.
export function moveLetter(letter,pointer) {
  let ax=-letter.dx*.025,ay=-letter.dy*.025;
  if(pointer){
    const x=pointer.x-(letter.x+letter.dx),y=pointer.y-(letter.y+letter.dy);
    const distance=Math.hypot(x,y),angle=Math.atan2(y,x);
    if(distance<100){const force=.05*(100-distance);ax-=force*Math.cos(angle);ay-=force*Math.sin(angle);}
  }
  letter.vx=(letter.vx+ax)*.8;letter.vy=(letter.vy+ay)*.8;
  letter.dx+=letter.vx;letter.dy+=letter.vy;
}
export async function installLoadingScreen(stage, {document=globalThis.document,
  requestFrame=globalThis.requestAnimationFrame.bind(globalThis),
  cancelFrame=globalThis.cancelAnimationFrame.bind(globalThis)}={}) {
  const overlay=document.createElement('div');overlay.className='web-loading-screen';
  overlay.setAttribute('role','status');overlay.setAttribute('aria-label','Loading Poptropica');
  overlay.setAttribute('aria-hidden','true');
  const images=layout.map(({id,x,y,width,height})=>{
    const image=document.createElement('img');image.src='/cloud/loading-art/'+id+'.png';image.alt='';image.draggable=false;
    image.width=width;image.height=height;image.className=id<12?'loading-letter':'loading-dot';
    image.style.cssText=`left:${x}px;top:${y}px;animation-delay:${-id*0.25}s`;
    overlay.append(image);return image;
  });
  // If any original artwork fails, leave the native transition as the fallback.
  await Promise.all(images.map(image=>image.decode()));
  stage.append(overlay);
  let serial=0,active=0,frame=null,last=null,elapsed=0,pointer=null;
  const letters=layout.map(({x,y,width,height})=>({x:x+width/2,y:y+height/2,dx:0,dy:0,vx:0,vy:0}));
  const point=event=>{
    if(!active||event.isPrimary===false)return;
    const rect=overlay.getBoundingClientRect();
    if(rect.width<=0||rect.height<=0)return;
    pointer={x:(event.clientX-rect.left)*overlay.offsetWidth/rect.width,y:(event.clientY-rect.top)*overlay.offsetHeight/rect.height};
  };
  const leave=()=>{pointer=null;};
  overlay.addEventListener('pointermove',point);overlay.addEventListener('pointerdown',point);
  overlay.addEventListener('pointerleave',leave);overlay.addEventListener('pointercancel',leave);
  const reset=()=>{
    if(frame!==null)cancelFrame(frame);frame=null;last=null;elapsed=0;pointer=null;
    letters.forEach((letter,i)=>{letter.dx=letter.dy=letter.vx=letter.vy=0;images[i].style.translate='0px 0px';images[i].style.rotate='0deg';});
  };
  const tick=time=>{
    frame=null;if(!active)return;
    if(last!==null)elapsed+=Math.min(100,Math.max(0,time-last));last=time;
    while(elapsed>=1000/30){letters.forEach(letter=>moveLetter(letter,pointer));elapsed-=1000/30;}
    letters.forEach((letter,i)=>{images[i].style.translate=`${letter.dx}px ${letter.dy}px`;images[i].style.rotate=`${letter.vx}deg`;});
    frame=requestFrame(tick);
  };
  return {
    show(){reset();active=++serial;overlay.classList.add('is-loading');overlay.setAttribute('aria-hidden','false');frame=requestFrame(tick);return active;},
    hide(token){if(token!==active)return false;active=0;reset();overlay.classList.remove('is-loading');overlay.setAttribute('aria-hidden','true');return true;},
    dispose(){active=0;reset();overlay.removeEventListener('pointermove',point);overlay.removeEventListener('pointerdown',point);overlay.removeEventListener('pointerleave',leave);overlay.removeEventListener('pointercancel',leave);overlay.remove();}
  };
}
