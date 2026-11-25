// Only start Ruffle after the account wrapper has restored the whole save set.
(() => {
  if (window.parent===window) {
    const destination=new URL('/play/',location.origin);
    if(location.search.includes('webDiagnostics')) destination.searchParams.set('webDiagnostics','1');
    location.replace(destination.href);
    return;
  }
  let started=false;
  // Ruffle sizes its canvas from the stage's CSS size times devicePixelRatio and
  // ignores the stage's CSS scale. Report that scale as well, so it draws only the
  // pixels actually shown: never below Flash's own resolution, never above the
  // browser's density. Ruffle reads this every frame, so resizes apply at once.
  // Low quality has no antialiasing, so keep 1.5x supersampling for smooth edges.
  let browserDensity=()=>1;
  for(let target=window;target;target=Object.getPrototypeOf(target)) {
    const descriptor=Object.getOwnPropertyDescriptor(target,'devicePixelRatio');
    if(descriptor) { browserDensity=descriptor.get ? ()=>descriptor.get.call(window)||1 : ()=>descriptor.value||1; break; }
  }
  let stageScale=1;
  try {
    Object.defineProperty(window,'devicePixelRatio',{configurable:true,get:()=>{
      const density=browserDensity();
      const supersample=window.webUseLowMemoryRendering?.()===true ? 1.5 : 1;
      return Math.min(density,Math.max(1,density*stageScale*supersample));
    }});
  } catch { /* Keep the browser's own density. */ }
  // Rasterize card lettering from its original vectors, not a small cached image.
  // Low-memory/touch policy remains unchanged; at most 560 x 800 per card.
  window.webCardBitmapScale=requested=>{
    if(!Number.isFinite(requested)||requested<=0) return 1;
    if(window.webUseLowMemoryRendering?.()!==false) return requested;
    const stage=document.getElementById('web-game-stage');
    const scale=stage ? stage.getBoundingClientRect().width/stage.offsetWidth : 1;
    const density=Math.max(1,Math.min(3,browserDensity()));
    return Math.min(2,Math.max(1,requested*scale*density*1.5));
  };
  const audioDocumentId=crypto.randomUUID();
  addEventListener('message',async event=>{
    if(event.origin!==location.origin || event.source!==parent || event.data?.type!=='poptropica:start' || started) return;
    started=true;
    // The account wrapper supplies the session that owns this restored bundle.
    // Native game requests use the same account and CSRF protection as saves.
    const online=event.data.online||{accountId:null,csrf:''};
    window.webOnlineConfig=()=>({...online});
    window.webSiteNotice=text=>{
      if(typeof text==='string'&&text.length<=500) parent.postMessage({type:'poptropica:notice',text},location.origin);
    };
    window.webOpenPanel=(panel,username)=>{
      if(['register','account','friends','photos','saves','graphics','help','settings'].includes(panel)) parent.postMessage({type:'poptropica:panel',panel,username:typeof username==='string'&&/^[A-Za-z0-9_]{3,24}$/.test(username)?username:''},location.origin);
    };
    window.webPhotoInventory=photos=>{
      if(Array.isArray(photos)&&photos.length<=1000)parent.postMessage({type:'poptropica:photos',photos},location.origin);
    };
    window.webRecordPhoto=(id,island,image='')=>window.webPhotoInventory([{id:String(id),island:String(island),image:typeof image==='string'?image:''}]);
    window.webSaveButton=()=>parent.postMessage({type:'poptropica:save',manual:true},location.origin);
    window.webRequestSave=()=>parent.postMessage({type:'poptropica:save'},location.origin);
    // A failed optional helper download must not strand the restored game.
    try {
      const {installInputRelease}=await import('/cloud/input-release.mjs');
      installInputRelease(window,()=>{
        const player=document.getElementById('flashContent');
        try { player?.webReleaseInput?.(); } catch { /* Player may be changing scenes. */ }
      });
    } catch(error) { console.warn('Input release helper is unavailable',error); }
    try {
      const {installCommonRoomTravel}=await import('/cloud/common-room-travel.mjs');
      installCommonRoomTravel(window,{accountId:online.accountId});
    } catch(error) { console.warn('Common-room travel is unavailable',error); }
    if(location.pathname==='/base.php') {
      try {
        const {prepareEngineEntry}=await import('/cloud/engine-entry.mjs');
        const entry=JSON.parse(document.body.dataset.webEntry||'null');
        const next=prepareEngineEntry(localStorage,location.hostname,entry,online.gamePolicy);
        if(next) {
          window.POSTToBase(next.room,next.island,next.path);
          return;
        }
        const {installLegacyNetwork}=await import('/cloud/legacy-network.mjs');
        installLegacyNetwork(window,online);
        // Optional audio must never prevent a successfully restored game from starting.
        try {
          const {installClassicAudioBridge}=await import('/cloud/classic-audio-bridge.mjs');
          installClassicAudioBridge(window,entry,audioDocumentId);
        } catch(error) { console.warn('Island sound is unavailable',error); }
      } catch(error) {
        document.body.textContent='The older-island save could not be loaded safely. Your original save is preserved. Reload to try again, or return to your earlier online save.';
        console.error('Legacy save conversion failed',error);
        return;
      }
    }
    // Object/embed options take precedence over Ruffle's global configuration.
    // Apply the device policy before the polyfill can create a player.
    const quality=window.RufflePlayer?.config?.quality;
    if(quality) {
      for(const player of document.querySelectorAll('object,embed')) {
        if(player.tagName==='EMBED') player.setAttribute('quality',quality);
        else for(const param of player.querySelectorAll('param[name="quality"]')) param.setAttribute('value',quality);
      }
    }
    const script=document.createElement('script'); script.src='/ruffle/ruffle.js';
    script.addEventListener('error',()=>{
      const panel=document.createElement('div');
      panel.style.cssText='position:fixed;inset:0;z-index:2147483647;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;background:#143b57;color:white;font:18px sans-serif;padding:24px;text-align:center';
      const text=document.createElement('p');
      text.textContent='The game player could not download. Your saved progress has not been changed. Check your connection, then retry.';
      const retry=document.createElement('button');retry.textContent='Retry loading game';
      retry.addEventListener('click',()=>location.reload());
      panel.append(text,retry);document.body.append(panel);
      window.webSiteNotice('The game player could not download. Retry loading the game.');
    },{once:true});
    document.head.appendChild(script);
  });
  addEventListener('DOMContentLoaded',()=>{
    const player=document.querySelector('object,embed');
    const width=Number(player?.getAttribute('width'))||960,height=Number(player?.getAttribute('height'))||640;
    if(player) {
      // Keep Flash's original viewport, but scale inside an untransformed iframe.
      // This avoids crossing a scaled frame boundary when Safari maps touch input.
      const stage=document.createElement('div');stage.id='web-game-stage';
      // Ruffle's built-in help text is not page content for search snippets.
      stage.setAttribute('data-nosnippet','');
      player.before(stage);stage.append(player);
      const style=document.createElement('style');
      style.textContent=`html,body{margin:0!important;overflow:hidden!important;width:100%;height:100%}.border{display:none!important}#web-game-stage{position:absolute;width:${width}px;height:${height}px;transform-origin:0 0}#web-game-stage>object,#web-game-stage>embed,#web-game-stage>ruffle-object,#web-game-stage>ruffle-embed{position:absolute!important;left:0!important;top:0!important;width:${width}px!important;height:${height}px!important;border:0!important}`;
      document.head.append(style);
      const fit=()=>{
        const scale=Math.min(innerWidth/width,innerHeight/height);
        if(Number.isFinite(scale)&&scale>0) stageScale=scale;
        stage.style.transform='scale('+scale+')';
        stage.style.left=(innerWidth-width*scale)/2+'px';stage.style.top=(innerHeight-height*scale)/2+'px';
      };
      addEventListener('resize',fit);fit();

    }
    let classicEntry=null;
    if(location.pathname==='/base.php') {
      try { classicEntry=JSON.parse(document.body.dataset.webEntry||'null'); } catch { /* Entry conversion reports errors above. */ }
    }
    const announceReady=()=>parent.postMessage({type:'poptropica:ready',width,height,audioDocumentId,classicEntry,nativeFrame:location.pathname==='/base.php'&&width===1136&&height===673},location.origin);
    announceReady();
    // The classic bridge handles /base.php restores after save handoff. AS3
    // has no bridge, so its restored document must clear prior classic sound.
    if(location.pathname==='/game/index.html')addEventListener('pageshow',event=>{
      if(event.persisted===true)announceReady();
    });
  },{once:true});
})();
