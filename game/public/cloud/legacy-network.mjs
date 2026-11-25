// Browser transport for the original AS2 room callbacks. The game supplies
// public appearance/movement only; the website session supplies its identity.
export function installLegacyNetwork(host,config) {
  let epoch=0,lease='',room='',latest=null,sequence=0,cursor=0,timer=null,queue=[],peers=new Map(),joined=false;
  const notice=text=>host.webSiteNotice?.(text);
  const emit=(method,...args)=>queue.push({method,args});
  const ownName=typeof config.username==='string'&&config.username?config.username:'Guest';
  const post=(type,values)=>host.parent?.postMessage({type,...values},host.location.origin);
  let activeMatch=null,requestSequence=0,matchSequence=0,selfStats='';
  let running=false,pollingEpoch=null,battleStart=null;
  const closedMatches=new Set();
  host.webCommonRoomBusy=()=>battleStart!==null||['waiting','playing'].includes(activeMatch?.phase);
  // Live matches require the server's 12-second presence lease. Preserve their
  // polling while hidden; idle rooms can sleep while Ruffle is suspended.
  const canPoll=()=>running&&(!host.document?.hidden||battleStart!==null||['waiting','playing'].includes(activeMatch?.phase));
  function schedule(delay,generation=epoch) {
    if(generation!==epoch||!canPoll())return;
    timer=host.setTimeout(()=>{timer=null;return poll(generation);},delay);
  }
  function acceptMatch(value,ticket) {
    if(ticket<matchSequence)return;
    if(value&&(closedMatches.has(value.id)||(value.id===activeMatch?.id&&value.serverTime<activeMatch.serverTime)))return;
    if(activeMatch?.players?.length===2&&(!value||['finished','abandoned'].includes(value.phase))&&(!value||['waiting','playing'].includes(activeMatch.phase)))
      emit('battleStop',...activeMatch.players.map(player=>player.username));
    matchSequence=ticket;activeMatch=value;post('poptropica:legacy-match',{match:activeMatch});
  }
  async function request(action,data={},keepalive=false) {
    const ticket=++requestSequence;
    const response=await host.fetch('/api/social.php?action='+action,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-CSRF-Token':config.csrf||''},body:JSON.stringify({...data,accountId:config.accountId}),signal:AbortSignal.timeout(8000),keepalive});
    const result=await response.json();
    if(!response.ok||result.accountId!==config.accountId)throw Error(result.message||result.error||'The multiplayer connection was interrupted.');
    return {...result,requestSequence:ticket};
  }
  function state(value) {
    if(!value||!Number.isFinite(Number(value.x))||!Number.isFinite(Number(value.y)))return null;
    return {x:Number(value.x),y:Number(value.y),direction:value.direction==='left'?'left':'right',look:{},lookString:String(value.lookString),avatarName:String(value.avatarName),status:value.status||'none'};
  }
  function snapshot(result) {
    const present=new Set();
    for(const player of result.peers||[]) {
      const login=player.username,appearance=player.state,old=peers.get(login),statsKey=JSON.stringify(player.stats||{});present.add(login);
      const info={login,ranking:player.stats?.ranking||0,points:player.stats?.points||0,countryCode:'-1',stateCode:-1,tribe:0};
      if(!old)emit('addUser',login,appearance.lookString,appearance.x,appearance.y,appearance.status||'none',appearance.avatarName,info,appearance.direction);
      else {
        if(player.sequence===undefined||player.sequence!==old.sequence)emit('webRemoteState',login,appearance.x,appearance.y,appearance.direction);
        if(old.lookString!==appearance.lookString)emit('changeLook',login,appearance.lookString);
        if(old.status!==appearance.status)emit('changeStatus',login,appearance.status||'none');
        if(old.statsKey!==statsKey)emit('changeInfo',login,info);
      }
      peers.set(login,{...appearance,statsKey,sequence:player.sequence});
    }
    for(const login of peers.keys())if(!present.has(login)){emit('removeUser',login);peers.delete(login);}
    for(const event of result.events||[]) {
      const data=event.data;
      if(data?.AT==='L'&&['emotion','actUser','webChat','battleInvite','battleStart','battleStop'].includes(data.command))emit(data.command,...data.args);
    }
    if(Object.hasOwn(result,'legacyMatch'))acceptMatch(result.legacyMatch,result.requestSequence);
    if(result.stats&&JSON.stringify(result.stats)!==selfStats){selfStats=JSON.stringify(result.stats);emit('changeInfo',ownName,{login:ownName,ranking:result.stats.ranking,points:result.stats.points,countryCode:'-1',stateCode:-1,tribe:0});}
    cursor=result.cursor??cursor;
  }
  function fail(error,start) {
    for(const login of peers.keys())emit('removeUser',login);
    peers.clear();lease='';joined=false;
    if(start)emit('webConnectFailure');
    notice(error.message||'Multiplayer is unavailable. Your saved progress is preserved.');
  }
  async function poll(generation) {
    if(generation!==epoch||!canPoll()||!latest||!config.accountId||pollingEpoch===generation)return;
    pollingEpoch=generation;
    let delay=host.document?.hidden?500:250;
    const starting=!joined;
    const pendingBattle=battleStart?.settled?battleStart:null;
    try {
      const result=await request(starting?'room-join':'room-update',starting?{room,state:latest}:{lease,state:latest,sequence:++sequence,cursor});
      if(generation!==epoch)return;
      if(starting){lease=result.lease;joined=true;sequence=0;emit('onStatus',{code:'NetConnection.Connect.Success'});}
      snapshot(result);
      // A poll begun before the Start response cannot confirm its new match.
      if(pendingBattle&&!starting&&battleStart===pendingBattle)battleStart=null;
    } catch(error){if(generation===epoch){delay=3000;fail(error,starting);}}
    finally {
      if(pollingEpoch===generation)pollingEpoch=null;
      schedule(delay===250&&host.document?.hidden?500:delay,generation);
    }
  }
  function leave() {
    running=false;battleStart=null;epoch++;host.clearTimeout(timer);timer=null;
    const previous=lease;lease='';joined=false;
    activeMatch=null;post('poptropica:legacy-match',{match:null});
    if(previous)void request('room-leave',{lease:previous},true).catch(()=>{});
  }
  host.webLegacyStart=options=>{
    leave();queue=[];peers=new Map();sequence=0;cursor=0;selfStats='';
    room=String(options?.room||'');latest=state(options?.state);
    if(!config.accountId){emit('webConnectFailure');notice('Sign in to meet other players in common rooms.');}
    else if(!/^as2:[a-z0-9]+:[a-z0-9_]+$/.test(room)||!latest)emit('webConnectFailure');
    else {running=true;void poll(epoch);}
    return {login:ownName};
  };
  host.webLegacyTick=value=>{
    latest=state(value)||latest;
    if(latest&&activeMatch&&['waiting','playing'].includes(activeMatch.phase))latest.status=activeMatch.kind;
    const pending=queue;queue=[];return pending;
  };
  host.webLegacyAction=(command,args)=>{
    if(!lease)return false;
    if(command==='actUser'&&args?.[1]==='friended'){host.webOpenPanel?.('friends');return true;}
    if(command==='changeLook'||command==='changeInfo'||command==='saveXY')return true; // Next snapshot carries live appearance and position.
    const generation=epoch;
    const starting=command==='battle'&&args?.[2]==='start'?{settled:false}:null;
    if(starting)battleStart=starting;
    void request('room-legacy-action',{lease,command,args,requestId:host.crypto.randomUUID()}).then(()=>{
      if(epoch!==generation||!starting||battleStart!==starting)return;
      starting.settled=true;
      if(timer===null)void poll(generation);
    }).catch(error=>{
      if(epoch!==generation)return;
      // The server may have accepted Start even if its reply was lost.
      if(starting&&battleStart===starting){starting.settled=true;if(timer===null)void poll(generation);}
      notice(error.message);
    });
    return true;
  };
  host.webLegacyLeave=leave;
  host.document?.addEventListener('visibilitychange',()=>{
    if(!canPoll()){host.clearTimeout(timer);timer=null;}
    else if(timer===null)void poll(epoch);
  });
  host.addEventListener('message',event=>{
    if(event.origin!==host.location.origin||event.source!==host.parent||event.data?.type!=='poptropica:legacy-move'||!lease||event.data.matchId!==activeMatch?.id)return;
    const generation=epoch;
    void request('room-legacy-game-action',{lease,matchId:activeMatch.id,command:event.data.command,params:event.data.params,requestId:host.crypto.randomUUID()}).then(result=>{
      if(epoch!==generation)return;
      if(event.data.command==='close')closedMatches.add(event.data.matchId);
      acceptMatch(result.match,result.requestSequence);
    }).catch(error=>{if(epoch===generation)post('poptropica:legacy-error',{text:error.message});});
  });
  host.addEventListener('pagehide',leave,{once:true});
  return {leave};
}
