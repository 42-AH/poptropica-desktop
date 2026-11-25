const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const {chromium} = require('C:/Users/dougl/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const origin = new URL(process.argv[2]).origin;
const profile = path.join(__dirname, 'qa-profile');
const offline = path.resolve(__dirname, '../../work/assembled/offline');
const {spawn} = require('node:child_process');
let php;
let browser, page, phase, count, failures, externals, observed;

async function start() {
  browser = await chromium.launchPersistentContext(profile, {
    executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless: true, viewport: {width:1100, height:760}, serviceWorkers:'block',
    args: ['--disable-background-networking','--no-first-run','--disable-sync','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost']
  });
  count = 0; failures = []; externals = []; observed = [];
  await browser.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === origin || ['blob:', 'data:'].includes(url.protocol)) return route.continue();
    externals.push(url.origin); return route.abort();
  });
  page = browser.pages()[0] || await browser.newPage();
  page.on('pageerror', error => console.log('PageError', error.message.slice(0,200)));
  page.on('response', res => {
    const url = new URL(res.url()); count++;
    if (res.status() >= 400) failures.push([res.status(),url.pathname]);
    if (/scene\.xml|Shell\.swf|gameplay\.swf|Char\.swf|CharCreation|StartScreen/i.test(url.pathname)) observed.push(url.pathname);
  });
  page.on('console', message => { if(message.type()==='error')console.log('Console',message.text().slice(0,200)); });
  await page.goto(process.argv[2]);
}
async function run(line) {
  const [cmd, a, b, c] = line.trim().split(/\s+/);
  if (cmd==='restart') { await browser.close(); await start(); return; }
  if (cmd==='quit') { await browser.close(); process.exit(0); }
  let frame = page.frames().at(-1);
  if(cmd==='classic') await frame.evaluate(()=>window.POSTToBase('Pit','Early','gameplay'));
  if(cmd==='click'||cmd==='hold') {
    await page.mouse.move(Number(a),Number(b));
    await page.mouse.down();
    await page.waitForTimeout(Number(c)||100);
    await page.mouse.up();
  }
  if(cmd==='key')await page.keyboard.press(a);
  if(cmd==='wait')await page.waitForTimeout(Number(a));
  if(cmd==='state') {
    frame=page.frames().at(-1);
    console.log(JSON.stringify({count,failures:failures.slice(-16),externals,observed:observed.slice(-16),
      frames:page.frames().map(f=>new URL(f.url()).pathname), state:await frame.evaluate(()=>{
        const p=document.querySelector('#flashContent');
        return {title:document.title,body:document.body.innerText.slice(0,180),stage:document.querySelector('#web-game-stage')?.getBoundingClientRect().toJSON(),
          keys:Object.keys(localStorage).filter(k=>/char|poptropica|sol|transit/i.test(k)).map(k=>[k,localStorage[k].length]).slice(0,30),
          callbacks:Object.keys(p||{}).filter(k=>/web|save|scene|room|load|position/i.test(k)),room:document.body.dataset.webEntry};
      })}));
  }
  if(cmd==='shot')await page.screenshot({path:path.join(__dirname,a+'.jpg'),type:'jpeg',quality:83,timeout:30000});
}
(async()=>{
  const addr = new URL(origin).host;
  php=spawn(path.join(offline,'runtime/php.exe'),['-n','-S',addr,'-t',path.join(offline,'public'),path.join(offline,'router.php')],{cwd:offline,windowsHide:true,stdio:['ignore','ignore',fs.openSync(path.join(__dirname,'server.log'),'a')]});
  process.on('exit',()=>php.kill());
  for(let i=0;i<30;i++){
    try{if((await fetch(origin+'/__desktop/health')).ok) break;}catch{}
    await new Promise(resolve=>setTimeout(resolve,150));
  }
  await start(); console.log('Ready');
  const reader=readline.createInterface({input:process.stdin});
  for await(const line of reader){try{await run(line);console.log('OK',line)}catch(e){console.log('ERROR',String(e));}}
})().catch(e=>{php?.kill();console.error(e);process.exitCode=1;});
