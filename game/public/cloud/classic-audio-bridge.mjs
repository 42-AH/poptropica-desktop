import {selectClassicAudio} from './classic-audio-catalog.mjs';

const validToken=value=>typeof value==='string'&&/^[a-zA-Z0-9-]{16,64}$/.test(value);
const eligible=entry=>entry&&typeof entry.island==='string'&&typeof entry.room==='string'&&selectClassicAudio(entry.island,entry.room);

// Called only after the older-engine save handoff succeeds. These callbacks
// carry scene names and small cue names, never progress or account information.
export function installClassicAudioBridge(host,entry,documentId) {
  host.webClassicSceneReady=()=>{};
  host.webClassicEffect=()=>{};
  if(!validToken(documentId)||!entry||typeof entry.island!=='string'||typeof entry.room!=='string')return;
  // A BFCache document keeps its native scene, but another iframe document may
  // have replaced its token in the parent while it was away.
  const player=host.document?.querySelector?.('object,embed');
  const width=Number(player?.getAttribute('width'))||960,height=Number(player?.getAttribute('height'))||640;
  const announce=()=>host.parent.postMessage({type:'poptropica:ready',width,height,audioDocumentId:documentId,classicEntry:entry},host.location.origin);
  if(!eligible(entry)) {
    host.addEventListener('pageshow',event=>{if(event.persisted===true)announce();});
    return;
  }
  const send=(action,extra={})=>host.parent.postMessage({type:'poptropica:classic-audio',documentId,action,...extra},host.location.origin);
  let ready=false,hidden=false;
  host.webClassicSceneReady=(island,room)=>{
    if(typeof island!=='string'||island.toLowerCase()!==entry.island.toLowerCase()||room!==entry.room)return;
    ready=true;if(!hidden)send('scene',{island,room});
  };
  host.webClassicEffect=cue=>{if(ready&&!hidden&&(cue==='item'||cue==='inventory'))send('effect',{cue});};
  host.addEventListener('pagehide',()=>{hidden=true;send('suspend');});
  host.addEventListener('pageshow',event=>{
    hidden=false;
    if(event.persisted!==true)return;
    announce();
    if(ready)send('scene',{island:entry.island,room:entry.room});
  });
}

// The iframe WindowProxy survives navigation. A document token also rejects
// callbacks queued by a previous room after the next document has become ready.
export function installClassicAudioMessages(controller,{host=window,getFrame,isActive}) {
  let documentId=null,entry=null,removeGestures=()=>{};
  const stop=()=>{documentId=null;entry=null;removeGestures();removeGestures=()=>{};controller.stop();};
  const receive=event=>{
    const frame=getFrame();
    if(!frame||event.source!==frame.contentWindow||event.origin!==host.location.origin||!isActive())return;
    const data=event.data;
    if(data?.type==='poptropica:ready') {
      removeGestures();removeGestures=()=>{};
      documentId=validToken(data.audioDocumentId)?data.audioDocumentId:null;
      entry=eligible(data.classicEntry)?data.classicEntry:null;
      if(!documentId||!entry){controller.stop();return;}
      controller.suspend();
      // A trusted click inside Flash also supplies browser audio activation.
      try {
        const doc=frame.contentDocument;
        if(doc){
          doc.addEventListener('pointerdown',controller.unlock,{passive:true});
          doc.addEventListener('keydown',controller.unlock);
          removeGestures=()=>{doc.removeEventListener('pointerdown',controller.unlock);doc.removeEventListener('keydown',controller.unlock);};
        }
      } catch { /* The visible enable button remains available. */ }
      return;
    }
    if(data?.type!=='poptropica:classic-audio'||!documentId||data.documentId!==documentId||!entry)return;
    if(data.action==='scene'&&typeof data.island==='string'&&data.island.toLowerCase()===entry.island.toLowerCase()&&data.room===entry.room)controller.setScene(data.island,data.room);
    else if(data.action==='suspend')controller.suspend();
    else if(data.action==='effect'&&(data.cue==='item'||data.cue==='inventory'))controller.effect(data.cue);
  };
  host.addEventListener('message',receive);
  return {stop,destroy(){stop();host.removeEventListener('message',receive);}};
}
