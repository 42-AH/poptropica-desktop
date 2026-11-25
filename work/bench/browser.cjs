const fs = require('node:fs');
const path=require('node:path');
const {chromium} = require('C:/Users/dougl/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
const id=process.argv[2];
const context=await chromium.launchPersistentContext(path.join(__dirname,id),{executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:false,viewport:{width:1120,height:690},args:['--no-first-run','--disable-sync']});
try{
const page=context.pages()[0];
await page.goto('https://poptropica.love/play/',{waitUntil:'domcontentloaded'});
const probe=fs.readFileSync(path.join(__dirname,'probe.js'),'utf8');
await page.waitForFunction(probe,null,{timeout:100000});
fs.writeFileSync(path.join(__dirname,id+'.json'),JSON.stringify(await page.evaluate(probe)));
await page.waitForTimeout(1800);
await page.evaluate(fs.readFileSync(path.join(__dirname,'cadence.js'),'utf8'));
await page.waitForFunction('window.benchDrawn',null,{timeout:20000});
fs.writeFileSync(path.join(__dirname,id+'.frames'),JSON.stringify(await page.evaluate(()=>window.benchDrawn)));
await page.screenshot({path:path.join(__dirname,id+'.jpg')});
}finally{await context.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1});
