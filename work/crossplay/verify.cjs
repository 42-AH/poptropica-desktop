const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const net=require('node:net');
const {once}=require('node:events');
const {spawn}=require('node:child_process');
const {chromium}=require('C:/Users/dougl/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const phpDir='C:/Users/dougl/Documents/Codex/2026-09-12/i-wa/work/php-8.4.25';
const source='C:/Users/dougl/Documents/Codex/2026-09-19/continue-maintaining-my-existing-poptropica-love/work/dead-air/candidate';
async function port(){const s=net.createServer();s.listen(0,'127.0.0.1');await once(s,'listening');const n=s.address().port;await new Promise(r=>s.close(r));return n;}
async function until(fn){for(let i=0;i<100;i++){try{let a=await fn();if(a)return a;}catch{}await new Promise(r=>setTimeout(r,200));}throw Error('Test client did not become ready');}
(async()=>{
 const p=await port(), debug=await port(), origin='http://127.0.0.1:'+p;
 const run=fs.mkdtempSync(path.join(__dirname,'case-'));
 const php=spawn(path.join(phpDir,'php.exe'),['-S','127.0.0.1:'+p,'-t',source+'/public',path.join(__dirname,'router.php')],{cwd:source,windowsHide:true,env:{...process.env,QA_CANDIDATE:source,POPTROPICA_DATA:run,POPTROPICA_ORIGIN:origin,POPTROPICA_ENV:'test'},stdio:'ignore'});
 let app,desktop,edge;
 try{
 await until(async()=>(await fetch(origin+'/room-test')).ok);
 app=spawn(path.join(__dirname,'Crossplay.exe'),[origin+'/room-test',path.join(run,'app')],{windowsHide:true,env:{...process.env,WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:'--remote-debugging-port='+debug+' --disable-background-networking'},stdio:'ignore'});
 await until(async()=>(await fetch('http://127.0.0.1:'+debug+'/json/version')).ok);
 desktop=await chromium.connectOverCDP('http://127.0.0.1:'+debug);
 const left=await until(async()=>desktop.contexts()[0]?.pages().find(p=>p.url()===origin+'/room-test'));
 edge=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--disable-background-networking']});
 const right=await edge.newPage();await right.goto(origin+'/room-test');
 const used=[];
 for(const [page,name] of [[left,'app_player'],[right,'browser_player']]){
 await page.evaluate(async username=>{
  let csrf,uid;
  async function call(api,action,data){const r=await fetch('/api/'+api+'.php?action='+action,data?{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify(data)}:{});const j=await r.json();if(!r.ok)throw Error(action+' '+r.status);if(j.csrf)csrf=j.csrf;if(j.user)uid=j.user.id;return j;}
  await call('cloud','session');await call('cloud','register',{username,password:crypto.randomUUID()});
  window.social=(action,data)=>call('social',action,{...data,accountId:uid});
 },name);
 const result=await page.evaluate(async()=>{const j=await social('room-join',{room:'as3:hub:arcade',state:{x:10,y:20,direction:'right',look:{gender:'male',shirt:'1'}}});window.lease=j.lease;return j.peers.map(p=>p.username);});used.push(result);
 }
 assert.deepEqual(used,[[],['app_player']]);
 let seen=await left.evaluate(async()=>{const j=await social('room-poll',{lease});return j.peers.map(p=>p.username)});assert.deepEqual(seen,['browser_player']);
 await left.evaluate(()=>social('room-update',{lease,sequence:1,state:{x:312,y:54,direction:'left',look:{gender:'male',shirt:'1'}}}));
 const moved=await right.evaluate(async()=>{const j=await social('room-poll',{lease});return j.peers[0].state.x;});assert.equal(moved,312);
 await right.evaluate(()=>social('room-update',{lease,sequence:1,state:{x:417,y:60,direction:'right',look:{gender:'female',shirt:'2'}}}));
 assert.equal(await left.evaluate(async()=>(await social('room-poll',{lease})).peers[0].state.x),417);
 for(const page of [left,right])await page.evaluate(()=>social('room-leave',{lease}));
 console.log('WebView2 and Edge signed in independently, saw each other in Arcade, received movement both ways, and left the room.');
 }finally{if(edge)await edge.close();app?.kill();php.kill();}
})().then(()=>process.exit(0),e=>{console.error(e.message);process.exit(1)});
