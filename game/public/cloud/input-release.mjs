// A release outside the iframe can be missed by the game's display tree.
// Observe browser pointer state and notify only our release callback. No input
// events are synthesized, and a new press cancels an older queued release.
export function installInputRelease(host, release) {
  const listeners=[];
  let held=false,generation=0,queued=null;
  const listen=(target,type,fn)=>{
    target.addEventListener(type,fn,true);
    listeners.push(()=>target.removeEventListener(type,fn,true));
  };
  function cancelFrame() {
    if(queued!==null)host.cancelAnimationFrame(queued);
    queued=null;
  }
  function endPress() {
    if(!held)return;
    held=false;
    const current=++generation;
    cancelFrame();
    queued=host.requestAnimationFrame(()=>{
      queued=null;
      if(current===generation&&!held)release();
    });
  }
  listen(host,'pointerdown',event=>{
    if(event.isPrimary===false||event.button!==0)return;
    ++generation;held=true;cancelFrame();
  });
  const moved=event=>{if(event.isPrimary!==false&&(event.buttons&1)===0)endPress();};
  const released=event=>{if(event.isPrimary!==false&&event.button===0)endPress();};
  listen(host,'pointermove',moved);
  listen(host,'pointerup',released);
  listen(host,'pointercancel',event=>{if(event.isPrimary!==false)endPress();});
  listen(host,'blur',endPress);
  listen(host.document,'visibilitychange',()=>{if(host.document.hidden)endPress();});
  // Same-origin wrapper events cover a mouse released beyond the game frame.
  if(host.parent&&host.parent!==host) {
    listen(host.parent,'pointermove',moved);
    listen(host.parent,'pointerup',released);
    listen(host.parent,'pointerdown',endPress);
  }
  const dispose=()=>{
    ++generation;held=false;cancelFrame();
    for(const remove of listeners.splice(0))remove();
  };
  listen(host,'pagehide',event=>{
    // A cached document resumes with the same player and installed bridge.
    // Only a real unload should permanently remove its listeners.
    if(event.persisted)endPress();
    else dispose();
  });
  return dispose;
}
