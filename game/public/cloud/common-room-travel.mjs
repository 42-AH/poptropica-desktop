// Exact authored destinations, matching the service's public common-room list.
// TribalCommon is a personal-tribe template, not a shared invitation target.
const as3={
  'as3:hub:arcade':'game.scenes.hub.arcade.Arcade',
  'as3:timmy:commonroom':'game.scenes.timmy.commonRoom.CommonRoom',
  'as3:arab3:commonroom':'game.scenes.arab3.commonRoom.CommonRoom',
  'as3:ghd:common':'game.scenes.ghd.common.Common',
  'as3:shrink:common':'game.scenes.shrink.common.Common',
  'as3:reality2:common':'game.scenes.reality2.common.Common',
};
const as2=[['Astro','Crop'],['Backlot','BacklotCommon'],['BigNate','Saltys'],['Boardwalk','BoardwalkCommon'],
  ['Carrot','Cinema'],['Charlie','CharlieCommon'],['Counter','BaguetteInn'],['Cryptid','CryptidCommon'],
  ['Early','Arcade'],['Early','Common'],['GameShow','GameShowCommon'],['Ghost','GhostCommon'],
  ['Japan','LibraryCommon'],['Moon','MoonCommon'],['Nabooti','Airlines'],['NightWatch','NightWatchCommon'],
  ['Peanuts','PeanutsCommon'],['Reality','Billiards'],['Shark','Coconut'],['Shipwreck','ShipwreckCommon'],
  ['Shrink','ShrinkCommon'],['Spy','HairClub'],['Steam','SteamCommon'],['Super','News'],['Time','Party'],
  ['Trade','BrokenBarrel'],['Train','ClubInterior'],['Vampire','VampireCommon'],['Villain','VillainCommon'],
  ['West','HotelInterior'],['Wimpy','WimpyCommon'],['Woodland','WoodlandCommon'],['Zombie','ZombieCommon']];
const destinations=new Map([
  ...Object.entries(as3).map(([room,scene])=>[room,{room,engine:'as3',scene}]),
  ...as2.map(([island,scene])=>{const room='as2:'+island.toLowerCase()+':'+scene.toLowerCase();return [room,{room,engine:'as2',scene,island}];})
]);
export function commonRoomDestination(value) {
  const known=destinations.get(value?.room);
  return known&&value.engine===known.engine&&value.scene===known.scene&&
    (value.island??'')===(known.island??'')?{...known}:null;
}

// Called only after the account wrapper authorizes the restored game session.
export function installCommonRoomTravel(host,{accountId}) {
  let authorized=null;
  const results=new Map();
  host.webCommonRoomAllowed=(room,engine,scene,island)=>!!authorized&&
    room===authorized.room&&engine===authorized.engine&&scene===authorized.scene&&(island??'')===(authorized.island??'');
  const reply=(requestId,result)=>host.parent.postMessage({type:'poptropica:common-room-travel-result',requestId,...result},host.location.origin);
  const receive=event=>{
    const data=event.data;
    if(event.origin!==host.location.origin||event.source!==host.parent||data?.type!=='poptropica:common-room-travel')return;
    if(typeof data.requestId!=='string'||!/^[a-zA-Z0-9-]{1,80}$/.test(data.requestId))return;
    if(!Number.isSafeInteger(accountId)||accountId<1||data.accountId!==accountId){reply(data.requestId,{ok:false,error:'The active account changed. Reopen Friends and try again.'});return;}
    if(results.has(data.requestId)){reply(data.requestId,results.get(data.requestId));return;}
    const destination=commonRoomDestination(data.destination);
    let result;
    if(!destination)result={ok:false,error:'That common-room destination is unavailable.'};
    else if(host.webCommonRoomBusy?.()===true)result={ok:false,error:'Finish your current multiplayer game before joining a friend.'};
    else {
      try {
        const player=Array.from(host.document.querySelectorAll('#web-game-stage > *')).find(node=>typeof node.webTravelToCommonRoom==='function');
        if(!player)throw Error('The game is still loading. Try again when your character is ready.');
        authorized=destination;
        const error=player.webTravelToCommonRoom(destination.room,destination.engine,destination.scene,destination.island??'');
        result=error===''?{ok:true}:{ok:false,error:typeof error==='string'&&error?error:'The game could not start travelling. Try again when your character is ready.'};
      }catch(error){result={ok:false,error:error.message||'The game could not start travelling.'};}
      finally{authorized=null;}
    }
    results.set(data.requestId,result);if(results.size>32)results.delete(results.keys().next().value);
    // Native callbacks schedule the transition for their next timer tick, so
    // this acknowledgement is posted before a cross-engine page navigation.
    reply(data.requestId,result);
  };
  host.addEventListener('message',receive);
  return ()=>{host.removeEventListener('message',receive);authorized=null;};
}

export function requestCommonRoomTravel({frame,destination,accountId,isCurrent=()=>true,host=globalThis,timeoutMs=10000}) {
  const target=frame?.contentWindow,known=commonRoomDestination(destination);
  if(!target||!known||!Number.isSafeInteger(accountId)||accountId<1||!isCurrent())return Promise.reject(Error('The active game changed. Reopen Friends and try again.'));
  const requestId=host.crypto.randomUUID();
  return new Promise((resolve,reject)=>{
    let timer;
    const finish=error=>{host.clearTimeout(timer);host.removeEventListener('message',receive);error?reject(error):resolve();};
    const receive=event=>{
      if(event.origin!==host.location.origin||event.source!==target||event.data?.type!=='poptropica:common-room-travel-result'||event.data.requestId!==requestId)return;
      if(!isCurrent())finish(Error('The active game changed. Reopen Friends and try again.'));
      else if(event.data.ok===true)finish();
      else finish(Error(typeof event.data.error==='string'?event.data.error:'The game could not start travelling.'));
    };
    host.addEventListener('message',receive);
    timer=host.setTimeout(()=>finish(Error('The game did not respond. Wait until your character is ready, then try again.')),timeoutMs);
    try{target.postMessage({type:'poptropica:common-room-travel',requestId,accountId,destination:known},host.location.origin);}
    catch(error){finish(error);}
  });
}
