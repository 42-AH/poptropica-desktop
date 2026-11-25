import {renderPlayerIdentity} from './player-identity.mjs';
import {skyDiveFrame,advanceMatchClock} from './legacy-motion.mjs';
// Our game screens for older multiplayer SWFs absent from the archive.
// The server supplies every board, turn, score, result and opponent identity.
export function createLegacyGamesPanel({send}) {
  const link=document.createElement('link');link.rel='stylesheet';link.href='/cloud/legacy-games.css';document.head.append(link);
  const dialog=document.createElement('dialog');dialog.className='legacy-games';dialog.setAttribute('aria-labelledby','legacy-game-title');
  const title=document.createElement('h2');title.id='legacy-game-title';
  const score=document.createElement('p'),instructions=document.createElement('p'),status=document.createElement('p');status.setAttribute('role','status');
  const canvas=document.createElement('canvas');canvas.width=600;canvas.height=400;canvas.tabIndex=0;canvas.setAttribute('aria-label','Game board');
  const controls=document.createElement('div');controls.className='legacy-game-controls';
  const actions=document.createElement('div');actions.className='legacy-game-actions';
  const ready=button('Ready',()=>move('ready')),leave=button('Leave game',()=>move('close'));actions.append(ready,leave);
  dialog.append(title,score,instructions,status,canvas,controls,actions);(document.getElementById('game-view')||document.body).append(dialog);
  const ctx=canvas.getContext('2d'),colors=['#dce9e7','#15895a','#2875cb'];
  let match=null,selected=-1,wordPath=[],angle=65,power=460,frame=0,receivedAt=0,clockTime=0,pending=false,error='',lastId=0;
  function button(text,action){const b=document.createElement('button');b.type='button';b.textContent=text;b.onclick=action;return b;}
  function now(){return clockTime+(performance.now()-receivedAt)/1000;}
  function move(command,params={}){if(!match||pending)return;pending=true;error='';send({matchId:match.id,command,params});}
  function setup() {
    selected=-1;wordPath=[];controls.replaceChildren();
    const tips={sudoku:'Fill empty cells with digits 1–9. Each row, column and 3×3 box uses each digit once. Claim the most cells; an incorrect digit gives a 10-second pause.',
      hoopshot:'Set your angle and power, then shoot. Make five baskets first. The basket moves after each score.',
      paintwar:'Aim your cannon and shoot. Pop seven paint balloons before your opponent.',
      hex:'Take turns claiming tiles. Green connects left to right; blue connects top to bottom. You have 20 seconds per turn.',
      boggle:'Connect neighboring letters to make words. Use each tile once per word. You have 60 seconds; each letter earns two points.',
      dotgame:'Claim a line between two stars. Finish a box to score and take another turn. The most boxes wins.',
      balloongame:'Choose a pump. Balloons rise to the highest empty cell. Connect four of your color in any direction.',
      skydive:'Wait for GO, then jump. Open your parachute before landing. The first safe landing wins.'};
    instructions.textContent=tips[match.kind]||'';
    if(match.kind==='sudoku')for(let digit=1;digit<=9;digit++)controls.append(button(String(digit),()=>{if(selected>=0)move('digit',{cell:selected,digit});}));
    if(match.kind==='boggle')controls.append(button('Submit word',()=>{move('word',{path:wordPath});wordPath=[];}),button('Clear letters',()=>{wordPath=[];}));
    if(match.kind==='hoopshot'||match.kind==='paintwar') {
      for(const [caption,min,max,start,change] of [['Angle',10,85,angle,v=>angle=v],['Power',200,750,power,v=>power=v]]) {
        const label=document.createElement('label'),range=document.createElement('input'),value=document.createElement('output');range.type='range';range.min=min;range.max=max;range.value=start;value.textContent=start;
        range.oninput=()=>{change(Number(range.value));value.textContent=range.value;};label.append(caption+' ',range,value);controls.append(label);
      }
      controls.append(button('Shoot',()=>move('shoot',{angle,power})));
    }
    if(match.kind==='skydive')controls.append(button('Jump',()=>move('fall')),button('Open parachute',()=>move('deployChute')));
  }
  function point(event){const box=canvas.getBoundingClientRect();return {x:(event.clientX-box.left)*600/box.width,y:(event.clientY-box.top)*400/box.height};}
  canvas.onpointerdown=event=>{
    if(!match)return;const {x,y}=point(event),s=match.state;canvas.focus();
    if(match.kind==='sudoku'){
      const col=Math.floor((x-120)/40),row=Math.floor((y-20)/40);
      if(col>=0&&col<9&&row>=0&&row<9)selected=row*9+col;
    } else if(match.kind==='hex') {
      let closest=-1,distance=Infinity;for(let i=0;i<81;i++){const r=Math.floor(i/9),c=i%9,d=Math.hypot(x-(65+c*39+r*19.5),y-(50+r*34));if(d<distance){closest=i;distance=d;}}
      if(distance<22)move('tile',{cell:closest});
    } else if(match.kind==='boggle') {
      const c=Math.floor((x-140)/80),r=Math.floor((y-30)/80),i=r*4+c;
      if(c>=0&&c<4&&r>=0&&r<4){const last=wordPath.at(-1);if(!wordPath.includes(i)&&(last===undefined||Math.abs(Math.floor(last/4)-r)<=1&&Math.abs(last%4-c)<=1))wordPath.push(i);}
    } else if(match.kind==='balloongame') {
      const col=Math.floor((x-75)/90)+1;if(col>=1&&col<=5)move('FB',{B_C:col});
    } else if(match.kind==='dotgame') {
      let best='',distance=24;
      for(let r=0;r<4;r++)for(let c=0;c<5;c++)for(const axis of ['h','v']){
        if(axis==='h'&&c===4||axis==='v'&&r===3)continue;
        const px=100+c*100+(axis==='h'?50:0),py=45+r*100+(axis==='v'?50:0),d=Math.hypot(x-px,y-py);
        if(d<distance){distance=d;best=String.fromCharCode(97+r)+(c+1)+axis;}
      }
      if(best)move('markLine',{lineId:best});
    }
  };
  canvas.onkeydown=event=>{if(match?.kind==='sudoku'&&selected>=0&&/^[1-9]$/.test(event.key)){event.preventDefault();move('digit',{cell:selected,digit:Number(event.key)});}};
  dialog.addEventListener('cancel',event=>{event.preventDefault();move('close');});
  function text(value,x,y,size=22,color='#153544'){ctx.fillStyle=color;ctx.font=`bold ${size}px system-ui`;ctx.textAlign='center';ctx.fillText(String(value),x,y);}
  function circle(x,y,r,color){ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();}
  function line(x1,y1,x2,y2,color,width=4){ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();}
  function draw() {
    if(!match||!dialog.open)return;const s=match.state,time=now(),slot=match.slot;
    ctx.clearRect(0,0,600,400);ctx.fillStyle='#eefaff';ctx.fillRect(0,0,600,400);
    const countdown=Math.max(0,Math.ceil((s.startedAt||0)-time)),cooldown=Math.max(0,Math.ceil((s.cooldown?.[slot-1]||0)-time));
    let message=match.phase==='waiting'?(s.ready?.[slot]?'Waiting for your opponent…':'Choose Ready when you want to start.'):
      match.phase==='abandoned'?'The match ended because a player left.':
      match.phase==='finished'?(s.winner===0?'It’s a draw!':s.winner===slot?'You win!':'Your opponent wins!'):
      countdown?`Starting in ${countdown}…`:cooldown?`Next move in ${cooldown}…`:
      ['hex','dotgame','balloongame'].includes(match.kind)?(s.turn===slot?'Your turn':'Your opponent’s turn'):'GO!';
    if(match.phase==='playing'&&match.kind==='boggle')message=`${Math.max(0,Math.ceil(s.startedAt+60-time))} seconds remaining`;
    if(match.phase==='playing'&&match.kind==='hex')message+=` · ${Math.max(0,Math.ceil(s.turnAt+20-time))} seconds`;
    if(status.textContent!==(error||message))status.textContent=error||message;
    ready.hidden=match.phase!=='waiting';ready.disabled=!!s.ready?.[slot]||pending;
    for(const b of controls.querySelectorAll('button'))b.disabled=pending||match.phase!=='playing'||(countdown>0&&match.kind!=='skydive')||cooldown>0;
    if(match.kind==='sudoku') {
      for(let i=0;i<81;i++){const x=120+i%9*40,y=20+Math.floor(i/9)*40,cell=s.cells?.[i];ctx.fillStyle=i===selected?'#ffdc72':cell?colors[cell.owner]:'#fff';ctx.fillRect(x,y,40,40);ctx.strokeStyle='#b5c8ce';ctx.lineWidth=1;ctx.strokeRect(x,y,40,40);if(s.puzzle[i]||cell)text(s.puzzle[i]||cell.digit,x+20,y+28,23,cell?'#fff':'#153544');}
      for(let i=0;i<=9;i+=3){line(120+i*40,20,120+i*40,380,'#284952',3);line(120,20+i*40,480,20+i*40,'#284952',3);}
    } else if(match.kind==='hex') {
      for(let i=0;i<81;i++){const r=Math.floor(i/9),c=i%9,x=65+c*39+r*19.5,y=50+r*34;ctx.beginPath();for(let n=0;n<6;n++){const a=(n*60+30)*Math.PI/180;ctx.lineTo(x+21*Math.cos(a),y+21*Math.sin(a));}ctx.closePath();ctx.fillStyle=colors[s.board?.[i]||0];ctx.fill();ctx.strokeStyle='#6a8790';ctx.lineWidth=1;ctx.stroke();}
      text('GREEN: LEFT ↔ RIGHT',180,385,15,colors[1]);text('BLUE: TOP ↕ BOTTOM',435,385,15,colors[2]);
    } else if(match.kind==='boggle') {
      for(let i=0;i<16;i++){const x=140+i%4*80,y=30+Math.floor(i/4)*80;ctx.fillStyle=wordPath.includes(i)?'#ffce64':'#fff';ctx.fillRect(x+3,y+3,74,74);text(s.letters[i].toUpperCase(),x+40,y+53,34);}
      text(wordPath.map(i=>s.letters[i]).join('').toUpperCase(),300,385,24);
    } else if(match.kind==='dotgame') {
      for(const [id,owner] of Object.entries(s.boxes||{})){ctx.fillStyle=colors[owner]+'55';ctx.fillRect(100+(Number(id[1])-1)*100,45+(id.charCodeAt(0)-97)*100,100,100);}
      for(let r=0;r<4;r++)for(let c=0;c<5;c++){
        for(const axis of ['h','v']){if(axis==='h'&&c===4||axis==='v'&&r===3)continue;const id=String.fromCharCode(97+r)+(c+1)+axis;line(100+c*100,45+r*100,100+c*100+(axis==='h'?100:0),45+r*100+(axis==='v'?100:0),colors[s.lines?.[id]||0],s.lines?.[id]?7:3);}
        circle(100+c*100,45+r*100,8,'#ffbd34');
      }
    } else if(match.kind==='balloongame') {
      for(let col=1;col<=5;col++){for(let row=1;row<=4;row++){const owner=s.board?.[col+':'+row]||0;circle(120+(col-1)*90,55+(row-1)*78,29,colors[owner]);}text('PUMP '+col,120+(col-1)*90,385,15);}
    } else if(match.kind==='hoopshot'||match.kind==='paintwar') {
      ctx.fillStyle='#d6ead4';ctx.fillRect(0,340,600,60);circle(80,328,21,colors[1]);circle(520,328,21,colors[2]);
      if(match.kind==='hoopshot'){line(324,s.hoopY-45,324,s.hoopY+20,'#546c76',7);line(277,s.hoopY,321,s.hoopY,'#e87925',7);text('BASKET',300,s.hoopY-55,14);}
      else for(const target of s.targets){if(!target.owner){circle(target.x,target.y,19,'#f9ad45');line(target.x,target.y+19,target.x-4,target.y+35,'#698a8e',1);}else circle(target.x,target.y,22,colors[target.owner]+'55');}
      const origin=slot===1?80:520,dir=slot===1?1:-1,r=angle*Math.PI/180;line(origin,320,origin+dir*Math.cos(r)*power/7,320-Math.sin(r)*power/7,colors[slot],4);
      for(const [index,shot] of Object.entries(s.shots||{})){const age=time-shot.at;if(age<0||age>shot.duration)continue;const player=Number(index)+1,rad=shot.angle*Math.PI/180,x=(player===1?80:520)+(player===1?1:-1)*Math.cos(rad)*shot.power*age,y=320-Math.sin(rad)*shot.power*age+250*age*age;circle(x,y,9,colors[player]);}
    } else if(match.kind==='skydive') {
      ctx.fillStyle='#c7e6bb';ctx.fillRect(0,365,600,35);
      for(let player=1;player<=2;player++){const flight=skyDiveFrame(s.flights?.[player],time);if(!flight)continue;const x=player===1?190:410,y=35+Math.max(0,Math.min(1860,flight.y-190))/1860*320;circle(x,y,15,colors[player]);
        if(['float','deployChute'].includes(flight.state)){ctx.fillStyle=colors[player];ctx.beginPath();ctx.arc(x,y-30,35,Math.PI,0);ctx.fill();line(x-30,y-30,x,y,colors[player],2);line(x+30,y-30,x,y,colors[player],2);}
        text(flight.state.replaceAll('_',' '),x,395,17);
      }
    }
    if(match.phase==='playing'&&countdown)text(countdown,300,210,64,'#e4771c');
    frame=requestAnimationFrame(draw);
  }
  return {
    update(value){
      if(!value){this.close();return;}
      if(!Number.isSafeInteger(value.id)||!['waiting','playing','finished','abandoned'].includes(value.phase)||!value.state||!Array.isArray(value.players))return;
      const changed=value.id!==lastId,received=performance.now();
      clockTime=advanceMatchClock(changed?null:clockTime,value.serverTime,(received-receivedAt)/1000);
      match=value;receivedAt=received;pending=false;
      if(changed){lastId=value.id;error='';setup();}
      title.textContent=value.title;score.replaceChildren();
      value.players.forEach((player,index)=>{
        if(index)score.append(document.createTextNode('   ·   '));
        const identity=document.createElement('span');renderPlayerIdentity(identity,player);
        score.append(identity,document.createTextNode(': '+(value.state.scores?.[index]||0)));
      });
      if(!dialog.open)dialog.showModal();cancelAnimationFrame(frame);draw();
    },
    error(text){pending=false;error=String(text).slice(0,250);},
    close(){cancelAnimationFrame(frame);match=null;lastId=0;pending=false;error='';if(dialog.open)dialog.close();}
  };
}
