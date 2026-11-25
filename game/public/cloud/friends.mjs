import {renderPlayerIdentity} from './player-identity.mjs';
// Website friendship UI. Only the account's public social fields reach this view.
export function createFriendsPanel({request,getUser,openAccount,onUpdate=()=>{},onJoinRoom=async()=>{}}) {
  const dialog=document.createElement('dialog');dialog.className='friends-dialog';
  dialog.setAttribute('aria-labelledby','friends-title');
  const title=document.createElement('h2');title.id='friends-title';title.textContent='Friends';
  const intro=document.createElement('p');intro.textContent='Add a friend by their poptropica.love username. They must accept your request.';
  const form=document.createElement('form');
  const label=document.createElement('label');label.textContent='Friend’s username';
  const input=document.createElement('input');input.name='friend-username';input.required=true;input.minLength=3;input.maxLength=24;input.pattern='[A-Za-z0-9_]+';input.autocomplete='off';
  label.append(input);
  const send=document.createElement('button');send.type='submit';send.textContent='Send request';
  form.append(label,send);
  const status=document.createElement('p');status.setAttribute('role','status');
  const lists=document.createElement('div');lists.className='friend-lists';
  const refresh=document.createElement('button');refresh.type='button';refresh.textContent='Refresh';
  const close=document.createElement('button');close.type='button';close.className='close';close.textContent='Close friends';close.setAttribute('aria-label','Close friends');
  const controls=document.createElement('div');controls.className='formlinks';controls.append(refresh,close);
  dialog.append(title,intro,form,status,lists,controls);(document.getElementById('game-view')||document.body).append(dialog);
  let generation=0,inFlight=false;
  function eligible(account,token){return getUser()?.id===account && token===generation && dialog.open;}
  function lock(value){inFlight=value;for(const button of dialog.querySelectorAll('button'))if(button!==close)button.disabled=value;}
  function render(data){
    lists.replaceChildren();
    if(data.stats){
      const summary=document.createElement('section'),heading=document.createElement('h3'),totals=document.createElement('p');
      heading.textContent='Online games';totals.textContent=`${data.stats.wins} wins · ${data.stats.losses} losses · ${data.stats.draws} draws`;
      summary.append(heading,totals);lists.append(summary);
    }
    const inviteSection=document.createElement('section'),inviteHeading=document.createElement('h3');
    inviteHeading.textContent='Room invitations';inviteSection.append(inviteHeading);
    const invites=Array.isArray(data.invites)?data.invites:[];
    if(!invites.length){const empty=document.createElement('p');empty.textContent='None';inviteSection.append(empty);}
    for(const invite of invites){
      const row=document.createElement('div');row.className='friend-row';
      const description=document.createElement('span');renderPlayerIdentity(description,invite.sender);
      description.append(document.createTextNode(' invited you to '+invite.room.label));row.append(description);
      const accept=document.createElement('button');accept.type='button';accept.textContent='Join room';
      accept.setAttribute('aria-label','Accept room invitation from '+invite.sender.username);
      accept.onclick=()=>run(()=>request('invite-accept',{inviteId:invite.id}),'',async(result,context)=>{
        if(!result.joinRoom||typeof result.joinRoom.id!=='string'||typeof result.joinRoom.label!=='string')throw Error('This room invitation is no longer available.');
        status.textContent='Joining '+result.joinRoom.label+'…';
        try { await onJoinRoom(result.joinRoom,context); }
        catch(error) { throw Error((error?.message||'The room could not be joined.')+' Ask your friend to send another invitation.'); }
        if(context.isCurrent())dialog.close();
      });
      const decline=document.createElement('button');decline.type='button';decline.textContent='Decline';
      decline.setAttribute('aria-label','Decline room invitation from '+invite.sender.username);
      decline.onclick=()=>run(()=>request('invite-decline',{inviteId:invite.id}),'Room invitation declined.');
      row.append(accept,decline);inviteSection.append(row);
    }
    lists.append(inviteSection);
    const sections=[['friends','Friends',[['Remove','friend-remove'],['Block','block']]],
      ['incoming','Requests received',[['Accept','friend-accept'],['Decline','friend-decline'],['Block','block']]],
      ['outgoing','Requests sent',[['Cancel request','friend-cancel']]],['blocked','Blocked players',[['Unblock','unblock']]]];
    for(const [key,name,actions] of sections){
      const section=document.createElement('section'),heading=document.createElement('h3');heading.textContent=name;section.append(heading);
      const players=data[key]||[];
      if(!players.length){const empty=document.createElement('p');empty.textContent='None';section.append(empty);}
      for(const player of players){
        const row=document.createElement('div');row.className='friend-row';
        const username=document.createElement('span');renderPlayerIdentity(username,player);row.append(username);
        if(key==='friends'&&data.currentRoom&&typeof data.currentRoom.id==='string'){
          const invite=document.createElement('button');invite.type='button';invite.textContent='Invite to room';
          invite.setAttribute('aria-label','Invite '+player.username+' to '+data.currentRoom.label);
          invite.onclick=()=>run(()=>request('invite-send',{playerId:player.id}),'Room invitation sent.');row.append(invite);
        }
        for(const [caption,action] of actions){
          const button=document.createElement('button');button.type='button';button.textContent=caption;button.setAttribute('aria-label',caption+' '+player.username);
          button.onclick=()=>run(async()=>request(action,{playerId:player.id}),caption==='Block'?'Player blocked.':'Friend list updated.');row.append(button);
        }
        section.append(row);
      }
      lists.append(section);
    }
  }
  async function run(operation,success='',afterSuccess=null){
    if(inFlight||!dialog.open)return;
    const account=getUser()?.id,token=generation;
    if(!account){dialog.close();openAccount();return;}
    lock(true);status.textContent='Loading…';
    try {
      const result=await operation();
      if(!eligible(account,token))return;
      onUpdate(account,result);render(result);status.textContent=success;
      if(afterSuccess&&eligible(account,token)){
        lock(true);
        await afterSuccess(result,{accountId:account,isCurrent:()=>eligible(account,token)});
      }
    } catch(error){if(eligible(account,token))status.textContent=error.message;}
    finally {if(eligible(account,token))lock(false);}
  }
  form.onsubmit=event=>{
    event.preventDefault();const username=input.value.trim(),account=getUser()?.id,token=generation;
    run(async()=>{
      const found=await request('lookup',undefined,'&username='+encodeURIComponent(username));
      if(!eligible(account,token))throw Error('The active account changed.');
      const result=await request('friend-request',{playerId:found.player.id});input.value='';return result;
    },'Request sent. Your friend can accept it from their Friends menu.');
  };
  refresh.onclick=()=>run(()=>request('friends'));
  close.onclick=()=>dialog.close();
  dialog.addEventListener('close',()=>{generation++;inFlight=false;lists.replaceChildren();status.textContent='';input.value='';});
  return {open(username){
    if(!getUser()){openAccount();return;}
    if(dialog.open)return;
    generation++;lock(false);if(typeof username==='string'&&/^[A-Za-z0-9_]{3,24}$/.test(username))input.value=username;dialog.showModal();run(()=>request('friends'));
  },close(){if(dialog.open)dialog.close();}};
}
