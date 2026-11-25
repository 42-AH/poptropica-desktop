// Presence is separate from saves. Only visible, signed-in game sessions report it.
export function createActivityTracker({getAccountId,isPlaying,send,
  page=globalThis.document,events=globalThis,
  every=(callback,ms)=>setInterval(callback,ms),cancel=timer=>clearInterval(timer)}) {
  let running=false,paused=false,timer=null,pending=false,generation=0,previousAccount=null;
  const eligible=()=>running&&!paused&&!page.hidden&&Number.isInteger(getAccountId())&&isPlaying();
  function reset(){generation++;previousAccount=null;if(timer!==null)cancel(timer);timer=null;}
  async function pulse(){
    if(pending)return;
    if(!eligible()){previousAccount=null;return;}
    const accountId=getAccountId(),version=generation;
    pending=true;
    try{
      const result=await send({accountId,continuing:previousAccount===accountId});
      if(version===generation&&eligible()&&getAccountId()===accountId)
        previousAccount=result.accountId===accountId?accountId:null;
    }catch{
      // An outage must not interrupt play or turn the missing interval into time.
      if(version===generation)previousAccount=null;
    }finally{
      pending=false;
      if(version!==generation&&eligible())void pulse();
    }
  }
  function schedule(){if(eligible()){timer=every(()=>void pulse(),30000);void pulse();}}
  function visibility(){reset();schedule();}
  function hide(){paused=true;reset();}
  function show(){paused=false;reset();schedule();}
  page.addEventListener('visibilitychange',visibility);
  events.addEventListener('pagehide',hide);
  events.addEventListener('pageshow',show);
  return {
    start(){running=true;reset();schedule();},
    stop(){running=false;reset();},
    destroy(){running=false;reset();page.removeEventListener('visibilitychange',visibility);
      events.removeEventListener('pagehide',hide);events.removeEventListener('pageshow',show);}
  };
}
