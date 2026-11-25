import {renderPlayerIdentity} from './player-identity.mjs';
import {requestCommonRoomTravel} from './common-room-travel.mjs';
import {META_KEY,MAX_BYTES,snapshot,prepareSnapshot,install,canonical,fingerprint,validateBundle,emptyBundle,chooseStartup,openBackups,backupGet,backupPut} from './save-store.mjs';
import {archiveVersion,archivePreparedVersion,historyPage,historyVersion,migrateBrowserBackups,transferCloudHistory} from './local-history.mjs';
import {createFriendsPanel} from './friends.mjs';
import {installFriendNotifications} from './friend-notifications.mjs';
import {createLegacyGamesPanel} from './legacy-games.mjs';
import {createPhotosPanel} from './photos.mjs';
import {createActivityTracker} from './activity.mjs';
import {createClassicAudio} from './classic-audio.mjs';
import {selectClassicAudio} from './classic-audio-catalog.mjs';
import {installClassicAudioMessages} from './classic-audio-bridge.mjs';
import {recoverStaleCsrf} from './session-recovery.mjs';
import {installRenderingMode} from './rendering-mode.mjs';

const $=id=>document.getElementById(id);

let db, user=null, csrf='', workspace, frame, locked=false, busy=false, authExpired=false;
let syncing=false, syncTimer, conflicted=false, pending=null, recoveryCode='', recoveryUsername='', mode='login';
const hostname=location.hostname;
let historyWarning='';
let restoringHistory=false;
let gamePolicy={};
const historyMigrations=new Map();
let gameWidth=960, gameHeight=640;
const now=()=>new Date().toISOString();
let messageTimer;
const message=(text,force=false)=>{
  $('status').textContent=text+(historyWarning?' '+historyWarning:'');
  if(!force&&!historyWarning&&/^(Saving online|Progress saved|Your game is ready|Saved on this browser)/.test(text))return;
  const toast=$('game-message');toast.textContent=$('status').textContent;toast.hidden=false;
  for(const dialog of document.querySelectorAll('dialog[open]')){
    if(dialog.id==='account-dialog'&&$('account-error').textContent===text)continue;
    let status=dialog.querySelector('.panel-feedback');
    if(!status){status=document.createElement('p');status.className='panel-feedback';status.setAttribute('role','status');dialog.append(status);}
    status.textContent=toast.textContent;
  }
  clearTimeout(messageTimer);messageTimer=setTimeout(()=>toast.hidden=true,8000);
};
function openGamePanel(id){const panel=$(id);if(panel&&!panel.open)panel.showModal();}
for(const button of document.querySelectorAll('[data-close]'))button.onclick=()=>button.closest('dialog').close();
for(const [id,label] of [['close-account-status','Close account'],['close-history','Close earlier saves']]){
  $(id).classList.add('close');$(id).setAttribute('aria-label',label);
}
$('troubleshooting-button').onclick=()=>openGamePanel('troubleshooting-dialog');
$('fullscreen').onclick=async()=>{
  try {if(document.fullscreenElement)await document.exitFullscreen();else await $('game-view').requestFullscreen();}
  catch {message('Your browser does not allow fullscreen here. The game still fills the page.');}
};
document.addEventListener('fullscreenchange',()=>{$('fullscreen').textContent=document.fullscreenElement?'Exit fullscreen':'Fullscreen';});
document.querySelector('label[for="import-file"]').onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();$('import-file').click();}};
const getBundle=()=>snapshot(localStorage,hostname);
let preparedCache=null;
const captureBundle=async()=>preparedCache=await prepareSnapshot(localStorage,hostname,preparedCache);
const ownerKey=owner=>'owner:'+owner;
function gameControlsAvailable(){return locked&&!busy&&!conflicted&&!restoringHistory&&workspace?.owner===(user?'user:'+user.id:'guest');}
const renderingButton=document.createElement('button');renderingButton.type='button';
$('rendering-control').append(renderingButton);
installRenderingMode({button:renderingButton,storage:localStorage,
  canChange:()=>locked&&!conflicted&&!restoringHistory&&!pending&&!!frame&&workspace?.owner===(user?'user:'+user.id:'guest'),
  offer:(text,apply)=>{if(!busy)notice(text,[['Save and restart',apply],['Cancel',async()=>clearNotice()]]);},
  report:message,
  restart:async()=>{
    await waitForSync();await syncNow();
    if(conflicted||pending)throw Error('Resolve the save conflict before changing graphics mode.');
    await checkpoint();stopPlayer();clearNotice();startPlayer();
    message('Graphics mode applied. Your saved progress is preserved.');
  }
});
const audioControls=document.createElement('span');audioControls.className='classic-audio-controls';audioControls.hidden=true;
$('classic-sounds').append(audioControls);
const classicAudio=createClassicAudio({container:audioControls,resolve:selectClassicAudio});
const classicAudioMessages=installClassicAudioMessages(classicAudio,{getFrame:()=>frame,isActive:()=>locked&&!conflicted&&!restoringHistory&&workspace?.owner===(user?'user:'+user.id:'guest')});
let pendingFriends=0;
const friendNotifications=installFriendNotifications({button:$('friends-button'),badge:$('friends-badge'),getAccountId:()=>null,onChange:count=>{
  if(count>pendingFriends)message('You have a friend request or invitation. Open the Friends icon to see it.');
  pendingFriends=count;
}});
const activity=createActivityTracker({getAccountId:()=>null,
  isPlaying:()=>locked&&!!frame&&!conflicted&&!restoringHistory&&workspace?.owner==='user:'+user?.id,
  send:data=>api('activity',{data})});
const legacyGamesPanel=createLegacyGamesPanel({send:move=>{
  if(gameControlsAvailable()&&frame)frame.contentWindow.postMessage({type:'poptropica:legacy-move',...move},location.origin);
}});
function openAccountPanel(){
  if(gameControlsAvailable())message(user ? 'Playing offline as '+user.username+'. Reconnect to sync your adventure.' : 'Sign in online once to play your account offline.',true);
}
const friendsPanel=createFriendsPanel({getUser:()=>user,openAccount:openAccountPanel,
onUpdate:(account,data)=>friendNotifications.update(account,(data.incoming?.length??0)+(data.invites?.length??0)),
onJoinRoom:async(room,context)=>{
  const travelFrame=frame;
  const isCurrent=()=>context.isCurrent()&&user?.id===context.accountId&&frame===travelFrame&&gameControlsAvailable()&&!pending;
  if(!isCurrent())throw Error('Finish saving or resolve the save conflict before joining your friend.');
  await waitForSync();
  if(!isCurrent())throw Error('Your active game changed. Ask your friend for another invitation.');
  await checkpoint();
  if(!isCurrent())throw Error('Your active game changed. Ask your friend for another invitation.');
  await requestCommonRoomTravel({host:window,frame:travelFrame,destination:room.destination,accountId:context.accountId,isCurrent});
  message('Joining '+room.label+'…');
  scheduleSync();
},request:async(action,data,query='')=>{
  const accountId=user?.id;
  if(!accountId||!gameControlsAvailable())throw Error('Sign in before using Friends.');
  if(action==='invite-accept'&&pending)throw Error('Finish saving before joining your friend.');
  const response=await fetch('/api/social.php?action='+encodeURIComponent(action)+query,{
    method:data?'POST':'GET',credentials:'same-origin',cache:'no-store',
    headers:data?{'Content-Type':'application/json','X-CSRF-Token':csrf}:{},
    body:data?JSON.stringify({...data,accountId}):undefined,signal:AbortSignal.timeout(15000)
  });
  const result=await response.json();
  if(user?.id!==accountId)throw Error('The active account changed.');
  if(!response.ok)throw Error(result.error||'Friends could not be reached.');
  if(result.accountId!==accountId)throw Error('The friend list belongs to a different account.');
  return result;
}});
const photosPanel=createPhotosPanel({getUser:()=>user,openAccount:openAccountPanel,notice:message,request:async(action,data)=>{
  const accountId=user?.id;
  if(!accountId||!gameControlsAvailable())throw Error('Sign in to view photos.');
  const response=await fetch('/api/photos.php?action='+encodeURIComponent(action),{
    method:data?'POST':'GET',credentials:'same-origin',cache:'no-store',
    headers:data?{'Content-Type':'application/json','X-CSRF-Token':csrf}:{},
    body:data?JSON.stringify({...data,accountId}):undefined,signal:AbortSignal.timeout(15000)
  });
  const result=await response.json();
  if(!response.ok){const error=Error(result.error||'Photos could not be loaded.');error.status=response.status;throw error;}
  if(user?.id!==accountId||result.accountId!==accountId)throw Error('The active account changed.');
  return result;
}});
for(const button of document.querySelectorAll('[data-panel]'))button.onclick=()=>{
  if(!gameControlsAvailable())return;
  const panel=button.dataset.panel;
  if(panel==='account')openAccountPanel();
  else if(panel==='photos')photosPanel.open();
  else if(panel==='friends')friendsPanel.open();
  else openGamePanel(panel+'-dialog');
};

// Browser dialogs must remain inside the fullscreen element.
for(const panel of document.querySelectorAll('dialog')){
  $('game-view').append(panel);
  panel.addEventListener('close',()=>panel.querySelector('.panel-feedback')?.remove());
}
$('game-view').append($('notice'),$('game-message'));
function readMeta() {try{return JSON.parse(localStorage.getItem(META_KEY));}catch{return null;}}
function writeMeta() {localStorage.setItem(META_KEY,JSON.stringify(workspace));}
function showIdentity() {
  friendNotifications.reset();
  friendsPanel.close();
  photosPanel.reset();
  renderPlayerIdentity($('identity'),user,'Offline');
  $('account-button').hidden=!!user; $('signout').hidden=true;
  const active=locked && workspace && workspace.owner===(user?'user:'+user.id:'guest');
  $('history').hidden=false; $('sync').disabled=!active;
  $('history').disabled=!active; $('import-file').disabled=!active;
  $('export').disabled=!locked || !workspace; $('account-button').disabled=!locked;
}
async function api(action,{data,query=''}={}) {
  const body=data?JSON.stringify(data):undefined;
  const send=async()=>{
    const response=await fetch('/api/cloud.php?action='+encodeURIComponent(action)+query,{
      method:data?'POST':'GET',credentials:'same-origin',cache:'no-store',
      headers:data?{'Content-Type':'application/json','X-CSRF-Token':csrf}:{},body,
      signal:AbortSignal.timeout(20000)
    });
    let result;try{result=await response.json();}catch{throw new Error('Couldn’t reach the save service. Your progress is still saved in this browser.');}
    if(!response.ok){const error=new Error(result.error||'The request failed.');error.status=response.status;error.code=result.code;error.conflict=result.conflict;throw error;}
    if(result.csrf) csrf=result.csrf;
    if(result.gamePolicy) gamePolicy=result.gamePolicy;
    return result;
  };
  const accountId=data?.accountId,owner=workspace?.owner;
  if((action==='save'||action==='activity')&&Number.isInteger(accountId)&&user?.id===accountId&&owner==='user:'+accountId) {
    return recoverStaleCsrf({send,accountId,refreshSession:()=>api('session'),
      isCurrent:()=>user?.id===accountId&&workspace?.owner===owner,
      onRecovered:()=>{$('account-button').hidden=true;}});
  }
  return send();
}
async function checkpoint(extra={},prepared=null) {
  if(!workspace) return;
  const active={...workspace},owner=active.owner;
  prepared=prepared||await captureBundle();
  const record={...active,...extra,bundle:prepared.bundle,savedAt:now()};
  try {await backupPut(db,ownerKey(owner),record);}
  catch(error) {historyWarning='This browser could not keep a backup. Download a backup to protect your progress.';throw error;}
  try {
    await archivePreparedVersion(db,owner,prepared,{savedAt:record.savedAt,revision:record.revision});historyWarning='';
  } catch {historyWarning='Earlier saves could not be stored on this browser. Download backups you want to keep.';}
  return record;
}
function migrateHistory(owner) {
  if(historyMigrations.has(owner))return historyMigrations.get(owner);
  const accountId=user?.id;
  const operation=(async()=>{
    await migrateBrowserBackups(db,owner);

  })().finally(()=>historyMigrations.delete(owner));
  historyMigrations.set(owner,operation);return operation;
}
function stopPlayer() {for(const panel of document.querySelectorAll('dialog[open]'))if(!['recovery-dialog','account-dialog'].includes(panel.id))panel.close();classicAudioMessages.stop();activity.stop();legacyGamesPanel.close();if(frame){frame.remove();frame=null;}$('player').replaceChildren();}
function fitPlayer() {
  if(!frame)return;
  // Size the actual iframe hit area; Safari can misroute taps into a scaled iframe.
  const host=$('player'),scale=Math.min(host.clientWidth/gameWidth,host.clientHeight/gameHeight);
  const width=Math.max(1,Math.floor(gameWidth*scale)),height=Math.max(1,Math.floor(gameHeight*scale));
  frame.style.width=width+'px';frame.style.height=height+'px';
  frame.style.left=Math.max(0,(host.clientWidth-width)/2)+'px';
  frame.style.top=Math.max(0,(host.clientHeight-height)/2)+'px';
}
new ResizeObserver(fitPlayer).observe($('player'));
function startPlayer() {
  if(!locked || frame || workspace?.owner!==(user?'user:'+user.id:'guest')) return;
  frame=document.createElement('iframe');frame.title='Poptropica game';
  // No top navigation permission: game transitions remain inside this frame.
  frame.setAttribute('sandbox','allow-scripts allow-same-origin allow-forms allow-downloads allow-pointer-lock');
  frame.allow='autoplay; fullscreen';
  frame.src='/game/index.html'+(new URLSearchParams(location.search).has('webDiagnostics')?'?webDiagnostics=1':'');
  $('player').replaceChildren(frame);
  fitPlayer();

  void migrateHistory(workspace.owner).catch(()=>{
    historyWarning='Some earlier saves couldn’t be moved to this browser. Existing cloud history was kept.';message('Your current game is ready.');
  });
}
function clearNotice() {$('notice').hidden=true;$('notice-actions').replaceChildren();}
function notice(text,actions) {
  for(const panel of document.querySelectorAll('dialog[open]'))if(panel.id!=='recovery-dialog')panel.close();
  $('notice-text').textContent=text;$('notice-actions').replaceChildren();$('notice').hidden=false;
  for(const [label,action] of actions){const button=document.createElement('button');button.textContent=label;button.addEventListener('click',()=>run(action));$('notice-actions').append(button);}
}
async function run(action) {
  if(busy) return;busy=true;
  try{await action();}catch(error){message(error.message);recoverStoppedPlayer();}finally{busy=false;}
}
function recoverStoppedPlayer() {
  // A failed transition may have reached the server. Reload to reconcile the
  // session and saved progress; never replay the operation or resume blindly.
  if(frame||conflicted)return;
  const owner=workspace?.owner;
  const sameOwner=()=>locked&&owner&&workspace?.owner===owner&&owner===(user?'user:'+user.id:'guest');
  const actions=[];
  if(sameOwner())actions.push(['Download this browser’s backup',async()=>{
    if(!sameOwner())throw Error('The active account changed. Reload before downloading a backup.');
    downloadBundle(getBundle());
  }]);
  actions.push(['Reload game',async()=>location.reload()]);
  notice('The game could not finish that change. Download a backup if available, then reload to check your account and saved progress.',actions);
}
async function setWorkspace(owner,bundle,revision=0,syncedDigest='',username='',start=true) {
  const previous=workspace;const before=getBundle();
  stopPlayer();await checkpoint();
  const next={owner,revision,syncedDigest,username};
  try{install(localStorage,hostname,bundle);workspace=next;writeMeta();await checkpoint();}
  catch(error){install(localStorage,hostname,before);workspace=previous;if(previous)writeMeta();throw error;}
  pending=null;conflicted=false;clearNotice();showIdentity();if(start)startPlayer();
  if(owner==='guest') message('Progress saved on this PC.');
  else {message('Your game is ready.');scheduleSync();}
}
async function preserveConflict(remote) {
  await checkpoint();
  if(remote.bundle) {
    await backupPut(db,'conflict:online:'+workspace.owner,{...remote,savedAt:now()});
    await archiveVersion(db,workspace.owner,remote.bundle,{revision:remote.revision});
  }
  await backupPut(db,'conflict:device:'+workspace.owner,{...workspace,bundle:getBundle(),savedAt:now()});
}
async function showConflict(remote) {
  const local=getBundle();
  conflicted=true;stopPlayer();
  try {await preserveConflict(remote);}
  catch {
    message('Your browser and online saves differ. Both versions are still available.');
    const actions=[['Download this device’s backup',async()=>downloadBundle(local)]];
    if(remote.bundle)actions.push(['Download online backup',async()=>downloadBundle(remote.bundle)]);
    actions.push(['Retry backups',()=>showConflict(remote)]);
    notice('This browser couldn’t back up both versions. Download copies before freeing browser storage, then retry. Your progress has not been replaced.',actions);
    return;
  }
  message('Two versions of your progress are available. Both are backed up in this browser.');
  notice('Another device has newer online progress. Choose which version to continue. Download this device’s backup first if you want to keep a separate copy.',[
    ['Use online progress',async()=>{await setWorkspace('user:'+user.id,remote.bundle||emptyBundle(),remote.revision,remote.digest||'',user.username);}],
    ['Keep this device’s progress',async()=>{
      const local=getBundle();workspace.revision=remote.revision;workspace.syncedDigest='';writeMeta();pending=null;conflicted=false;
      await syncNow();if(!conflicted){clearNotice();startPlayer();}
    }],
    ['Download this device’s backup',async()=>downloadBundle(getBundle())]
  ]);
}
async function selectAccount(account) {
  stopPlayer();clearTimeout(syncTimer);await waitForSync();
  const previous=await checkpoint();user=account;showIdentity();
  const owner='user:'+user.id;
  const local=await backupGet(db,ownerKey(owner));
  const remote=await api('save');
  if(remote.accountId!==account.id) throw new Error('The signed-in account changed. Reload before loading progress.');
  const localDigest=local?await fingerprint(local.bundle):'';
  const choice=chooseStartup(local,remote,localDigest);
  if(choice==='new') {
    message('Choose the starting progress for '+user.username+'.');
    const actions=[['Start a new game',()=>setWorkspace(owner,emptyBundle(),0,'',user.username)]];
    if(previous?.owner==='guest' && Object.keys(previous.bundle.files).length) actions.unshift(['Use this browser’s guest progress',()=>setWorkspace(owner,previous.bundle,0,'',user.username)]);
    notice('This account has no online save yet. Your guest progress is kept separately.',actions);return;
  }
  if(choice==='remote') {await setWorkspace(owner,remote.bundle||emptyBundle(),remote.revision,remote.digest||'',user.username);return;}
  await setWorkspace(owner,local.bundle,local.revision,local.syncedDigest||'',user.username,choice!=='conflict');
  if(choice==='conflict') await showConflict(remote);
}
function scheduleSync() {
  clearTimeout(syncTimer);
  syncTimer=setTimeout(()=>syncNow().catch(error=>message(error.message)),1200);
}
async function waitForSync() {
  while(syncing) await new Promise(resolve=>setTimeout(resolve,30));
}
async function syncNow() {
  if(!locked || !workspace || restoringHistory)return;
  await checkpoint();
  message('Progress saved on this PC.');
}
function download(name,text,type='application/json') {
  const url=URL.createObjectURL(new Blob([text],{type}));
  const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);
}
function downloadBundle(bundle) {download('poptropica-save-'+new Date().toISOString().slice(0,10)+'.json',canonical(bundle));}
function setMode(next) {
  mode=next;$('submit-account').textContent=mode==='register'?'Create account':mode==='recover'?'Reset password':'Sign in';
  for(const option of ['login','register','recover'])$('mode-'+option).hidden=option===mode;
  $('account-title').textContent=mode==='register'?'Create your account':mode==='recover'?'Recover your account':'Account Settings';
  $('password').autocomplete=mode==='login'?'current-password':'new-password';
  $('recovery-label').hidden=mode!=='recover';$('recovery').required=mode==='recover';
  $('account-error').textContent='';
}
$('account-button').onclick=()=>{$('account-dialog').showModal();setMode('login');};
$('friends-button').onclick=()=>{if(gameControlsAvailable())friendsPanel.open();};
$('close-account-status').onclick=()=>$('account-status-dialog').close();
$('account-signout').onclick=()=>{$('account-status-dialog').close();$('signout').click();};
$('close-account').onclick=()=>$('account-dialog').close();
for(const next of ['login','register','recover']) $('mode-'+next).onclick=()=>{
  if(busy)return;
  setMode(next);
  if(next==='register'&&$('username').value&&$('password').value)$('account-form').requestSubmit();
};
$('account-form').addEventListener('invalid',event=>{
  const field=event.target;
  $('account-error').textContent=field.id==='username'?'Use 3–24 letters, numbers, or underscores for your username.':field.id==='password'?'Use a password between 12 and 72 characters long.':'Enter your recovery code.';
},true);
$('account-form').onsubmit=async event=>{
  event.preventDefault();if(busy){$('account-error').textContent='Please wait for the current save to finish, then try again.';return;}busy=true;$('submit-account').disabled=true;
  $('account-error').textContent=mode==='register'?'Creating your account…':'Signing in…';
  let authenticated=false;
  try {
    // Flush under the old session before changing accounts. Keep any unsynced backup.
    stopPlayer();clearTimeout(syncTimer);await waitForSync();await syncNow();await checkpoint();
    // A session may have expired while the player was offline; refresh CSRF first.
    await api('session');
    const data={username:$('username').value,password:$('password').value,recoveryCode:$('recovery').value};
    const result=await api(mode,{data});authenticated=true;$('password').value='';$('recovery').value='';
    $('account-dialog').close();pending=null;
    user=result.user;authExpired=false;showIdentity();
    if(result.recoveryCode){recoveryCode=result.recoveryCode;recoveryUsername=result.user.username;$('recovery-code').textContent=recoveryCode;$('recovery-dialog').showModal();}
    await selectAccount(result.user);
  } catch(error) {
    $('account-error').textContent=error.message;message(error.message);
    if(authenticated) notice('You’re signed in, but the online save couldn’t load. Your previous browser progress is backed up.',[['Retry loading this account',()=>selectAccount(user)]]);
    else {
      if(workspace&&!conflicted)startPlayer();
      if(!$('account-dialog').open)$('account-dialog').showModal();
    }
  }
  finally{busy=false;$('submit-account').disabled=false;}
};
$('download-recovery').onclick=()=>download('poptropica-recovery-code.txt','Username: '+recoveryUsername+'\nRecovery code: '+recoveryCode+'\nKeep this code private.\n','text/plain');
$('saved-recovery').onclick=()=>{$('recovery-dialog').close();$('recovery-code').textContent='';recoveryCode='';};
$('signout').onclick=()=>run(async()=>{
  stopPlayer();await waitForSync();await syncNow();await checkpoint();
  await api('logout',{data:{}});user=null;pending=null;showIdentity();
  const guest=await backupGet(db,ownerKey('guest'));
  await setWorkspace('guest',guest?.bundle||emptyBundle());
});
$('sync').onclick=()=>run(async()=>{await syncNow();message($('status').textContent,true);});
$('export').onclick=()=>run(async()=>downloadBundle(getBundle()));
$('import-file').onchange=()=>run(async()=>{
  if(!locked || !workspace || workspace.owner!==(user?'user:'+user.id:'guest'))return;
  const file=$('import-file').files[0];$('import-file').value='';if(!file)return;
  if(file.size>MAX_BYTES) throw new Error('The backup is too large.');
  const bundle=validateBundle(JSON.parse(await file.text()));
  stopPlayer();await waitForSync();await checkpoint();
  notice('Replace the current game with this backup? Your current progress will be kept in a local backup.',[
    ['Import this backup',async()=>{
      await backupPut(db,'before-import:'+workspace.owner,{...workspace,bundle:getBundle(),savedAt:now()});
      await setWorkspace(workspace.owner,bundle,workspace.revision,'',workspace.username);await syncNow();
    }],['Cancel',async()=>{clearNotice();startPlayer();}]
  ]);
});
$('history').onclick=()=>run(async()=>{
  const owner=workspace?.owner;if(!owner||!locked)return;
  $('versions').textContent='Loading this browser’s earlier saves…';$('history-dialog').showModal();
  try {await migrateHistory(owner);}catch {historyWarning='Some earlier cloud saves still need to be transferred to this browser.';}
  if(workspace?.owner!==owner)return;
  $('versions').replaceChildren();
  async function page(before) {
    if(workspace?.owner!==owner)return;
    const rows=await historyPage(db,owner,before);
    for(const version of rows) {
      const button=document.createElement('button');
      const date=new Date(version.savedAt.includes('T')?version.savedAt:version.savedAt.replace(' ','T')+'Z');
      button.textContent='Restore save · '+date.toLocaleString();
      button.onclick=()=>run(async()=>{
        if(workspace?.owner!==owner)return;
        const old=await historyVersion(db,owner,version.id);if(!old)throw new Error('That browser save is no longer available.');
        stopPlayer();await waitForSync();await checkpoint();
        const remote=user?await api('save'):null;
        if(remote?.bundle)await archiveVersion(db,owner,remote.bundle,{revision:remote.revision});
        $('history-dialog').close();
        notice('Restore this earlier save? Your current progress is backed up on this browser first.',[
          ['Restore earlier save',async()=>{
            if(workspace?.owner!==owner)return;
            restoringHistory=true;clearTimeout(syncTimer);
            try {
              await waitForSync();
              await backupPut(db,'before-restore:'+owner,{...workspace,bundle:getBundle(),savedAt:now()});
              // Acknowledged autosaves from this browser may finish while the
              // confirmation is open. Other devices still face revision checks.
              const revision=Math.max(remote?.revision||0,workspace.revision||0);
              await setWorkspace(owner,old.bundle,revision,'',workspace.username,false);
            } finally {restoringHistory=false;}
            await syncNow();if(!conflicted)startPlayer();
          }],['Cancel',async()=>{clearNotice();startPlayer();}]
        ]);
      });$('versions').append(button);
    }
    if(rows.length===50) {
      const more=document.createElement('button');more.textContent='Load older saves';
      more.onclick=()=>run(async()=>{more.remove();await page(rows.at(-1).id);});$('versions').append(more);
    } else if(!$('versions').childElementCount)$('versions').textContent='No earlier saves on this browser yet.';
  }
  await page();
});
$('close-history').onclick=()=>$('history-dialog').close();

addEventListener('message',event=>{
  if(event.origin===location.origin && event.source===frame?.contentWindow && event.data?.type==='poptropica:ready' && locked) {
    $('game-view').classList.toggle('has-native-frame',event.data.nativeFrame===true);
    gameWidth=Math.max(320,Math.min(1600,Number(event.data.width)||960));
    gameHeight=Math.max(240,Math.min(1000,Number(event.data.height)||640));fitPlayer();
    $('player').style.aspectRatio=gameWidth+'/'+gameHeight;
    frame.contentWindow.postMessage({type:'poptropica:start',online:{accountId:null,username:'',csrf:'',gamePolicy}},location.origin);
  }
  if(event.origin===location.origin && event.source===frame?.contentWindow && event.data?.type==='poptropica:notice' &&
     locked && !busy && !conflicted && !restoringHistory && typeof event.data.text==='string' && event.data.text.length<=500) message(event.data.text);
  if(event.origin===location.origin && event.source===frame?.contentWindow && event.data?.type==='poptropica:panel' && gameControlsAvailable()) {
    if(event.data.panel==='account')openAccountPanel();
    else if(event.data.panel==='register')openAccountPanel('register');
    else if(event.data.panel==='friends')message('Open Play online to join your friends.',true);
    else if(event.data.panel==='photos')message('Open Play online to view account photos.',true);
    else if(event.data.panel==='saves')openGamePanel('saves-dialog');
    else if(event.data.panel==='graphics')openGamePanel('graphics-dialog');
    else if(event.data.panel==='help')openGamePanel('help-dialog');
    else if(event.data.panel==='settings')openGamePanel('classic-settings-dialog');
  }
  if(event.origin===location.origin&&event.source===frame?.contentWindow&&gameControlsAvailable()){
    if(event.data?.type==='poptropica:legacy-match')legacyGamesPanel.update(event.data.match);
    else if(event.data?.type==='poptropica:legacy-error')legacyGamesPanel.error(event.data.text);
    else if(event.data?.type==='poptropica:photos')photosPanel.record(event.data.photos);
  }
  if(event.origin===location.origin && event.source===frame?.contentWindow && event.data?.type==='poptropica:save' && gameControlsAvailable()) {
    if(event.data.manual===true)run(async()=>{await syncNow();message($('status').textContent,true);});
    else syncNow();
  }
});
addEventListener('storage',event=>{
  if(event.storageArea===localStorage && event.key?.startsWith(hostname+'/')) scheduleSync();
});
addEventListener('online',()=>scheduleSync());
addEventListener('visibilitychange',()=>{if(document.hidden)syncNow();});

async function initialize() {
  locked=true;db=await openBackups();
  workspace=readMeta()||{owner:'guest',revision:0,syncedDigest:'',username:''};
  writeMeta();await checkpoint();
  const cached=JSON.parse(localStorage.getItem('poptropica.desktop.offline.v1')||'null');
  if(cached && cached.owner===workspace.owner && /^user:[1-9][0-9]*$/.test(workspace.owner)){
    user={id:Number(workspace.owner.slice(5)),username:workspace.username};
    showIdentity();clearNotice();startPlayer();
    message('Playing offline as '+user.username+'. Progress is saved on this PC.');
    return;
  }
  const session=await api('session');csrf=session.csrf;
  user=session.user;showIdentity();
  if(user) await selectAccount(user);
  else {
    const guest=await backupGet(db,ownerKey('guest'));
    await setWorkspace('guest',guest?.bundle||emptyBundle());
  }
}
if(!navigator.locks) {
  message('This browser cannot safely coordinate game saves. Please use a current Chrome, Edge, or Firefox browser.');
} else navigator.locks.request('poptropica-game-workspace',{ifAvailable:true},async lock=>{
  if(!lock){message('The game is already open in another tab. Close that tab, then reload this one.');$('player').textContent='One active game tab protects your progress.';return;}
  try{await initialize();if(new URLSearchParams(location.search).get('help')==='1')openGamePanel('troubleshooting-dialog');}
  catch(error){message(error.message);notice('The game didn’t start. Your saves are unchanged.',[['Retry',async()=>{clearNotice();await initialize();}]]);}
  await new Promise(()=>{});
});
showIdentity();
