import {editBridgeSaves} from './legacy-sol.mjs';

const validName=value=>typeof value==='string' && /^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/.test(value);
const validNumber=value=>typeof value==='number' && Number.isFinite(value);
const title='game.scenes.start.startScreen.StartScreen';
// Original room IDs and arrival coordinates. Only the game's confirmed
// restart transition invokes these operations; other quests stay unchanged.
const miniquests={Haunted:{room:'Haunted1',x:2437,y:1226},LegendarySwords:{room:'Landing',x:728,y:2219}};
const globalQuests=[
  {rooms:['GlobalDrHare_Exterior','GlobalDrHare_Interior','GlobalDrHare_Maze'],room:'GlobalDrHare_Exterior',x:409,y:1108,fields:['DrHare_Card1','DrHare_Card2','DrHare_Card3']},
  {rooms:['GlobalEarthDay_Exterior','GlobalEarthDay_Interior'],room:'GlobalEarthDay_Exterior',x:468,y:920,fields:[]},
];

export function prepareEngineEntry(storage,hostname,entry,policy={}) {
  if(!entry) return null;
  if(!validName(entry.room) || !validName(entry.island)) throw Error('Invalid island destination');
  const transition=entry.room.startsWith('Ad') && !['AdGroundH52','AdGroundH42'].includes(entry.room);
  const names=['Char'];
  if(entry.home)names.push('TransitToken');
  if(transition)names.push('Backup');
  return editBridgeSaves(storage,hostname,names,documents=>{
    const character=documents.Char;
    // The server grants bonus access to everyone. This is an original-game
    // compatibility field, not an account identifier or authentication flag.
    if(character && policy.bonusQuests===true) character.mem_status='active-norenew';
    if(entry.home) {
      const token=documents.TransitToken??(documents.TransitToken=Object.create(null));
      token.nextScene=title;
      for(const key of ['popURL','fromLogin','loadAS3','webReturnMapPending','webReturnRealmsPending','webReturnScenePending','nextX','nextY','nextDirection','destX','destY','destDirection'])delete token[key];
      return null;
    }
    if(entry.restart) {
      if(!character)throw Error('Your character must be loaded before restarting a quest.');
      const quest=globalQuests.find(q=>q.rooms.includes(entry.from||character.last_room));
      const start=quest||miniquests[entry.island];
      if(!start)throw Error('This quest must be restarted from its island map.');
      if(quest)for(const field of quest.fields)delete character[field];
      else for(const field of ['inventory','removedItems','completedEvents']) {
        if(character[field] && typeof character[field]==='object')delete character[field][entry.island];
      }
      for(const field of ['dir','leftExit','leftExitX','leftExitY','rightExit','rightExitX','rightExitY','timeWarp'])delete character[field];
      character[start.room+'xPos']=start.x;character[start.room+'yPos']=start.y;
      return {room:start.room,island:entry.island,path:'gameplay'};
    }
    if(transition && character && documents.Backup) {
      const saved=documents.Backup;
      const exits=['left','right'].map(side=>({side,room:saved[side+'Exit'],x:saved[side+'ExitX'],y:saved[side+'ExitY']}))
        .filter(exit=>validName(exit.room)&&!exit.room.startsWith('Ad')&&validNumber(exit.x)&&validNumber(exit.y));
      const arrival=character[entry.room+'xPos'];
      // Continue through the corridor's far door. With incomplete exit data,
      // leave the original room playable instead of redirecting in a loop.
      const exit=exits.length===1?exits[0]:validNumber(arrival)?exits.find(e=>e.side===(arrival<388?'right':'left')):null;
      if(exit) {
        character[exit.room+'xPos']=exit.x;character[exit.room+'yPos']=exit.y;
        delete character[entry.room+'xPos'];delete character[entry.room+'yPos'];
        return {room:exit.room,island:entry.island,path:'gameplay'};
      }
    }
    return null;
  });
}
