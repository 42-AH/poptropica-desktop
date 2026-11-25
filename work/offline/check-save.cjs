const fs=require('node:fs');
const path=require('node:path');
const ws=new WebSocket(process.argv[2]);
const backup=path.join(__dirname,'guest-adventure.json');
const bundle=JSON.parse(fs.readFileSync(backup));
const pending=new Map();
let next=1;
function command(method,params){
    const id=next++;
    return new Promise((resolve,reject)=>{
        pending.set(id,{resolve,reject});
        ws.send(JSON.stringify({id,method,params}));
    });
}
ws.onmessage=e=>{
    const message=JSON.parse(e.data);
    const item=pending.get(message.id);
    if (!item) return;
    pending.delete(message.id);
    if (message.error) item.reject(Error(message.error.message));
    else item.resolve(message.result);
};
async function evaluate(expression){
    const reply=await command('Runtime.evaluate',{expression,returnByValue:true});
    if(reply.exceptionDetails) throw Error(reply.exceptionDetails.text);
    return reply.result.value;
}
async function until(check){
    for(let t=0;t<60;t++){
        if(await check()) return;
        await new Promise(resolve=>setTimeout(resolve,150));
    }
    throw Error('The guest backup did not load');
}
const timeout=setTimeout(()=>process.exit(1),20000);
ws.onopen=async()=>{
    try{
        if(process.argv[3]==='import'){
            const {root}=await command('DOM.getDocument',{});
            const {nodeId}=await command('DOM.querySelector',{nodeId:root.nodeId,selector:'#import-file'});
            await command('DOM.setFileInputFiles',{nodeId,files:[backup]});
            const confirm=`Array.from(document.querySelectorAll('#notice-actions button')).find(e=>e.textContent==='Import this backup')`;
            await until(()=>evaluate('Boolean('+confirm+')'));
            await evaluate(confirm+'.click()');
        }
        await until(()=>evaluate("localStorage.getItem(location.hostname+'//poptropica')?.length>5000"));
        const matches=await evaluate(`Object.entries(${JSON.stringify(bundle.files)}).filter(([key,value])=>localStorage.getItem(location.hostname+key)===value).length`);
        if(matches<2) throw Error('The restored game does not match the guest fixture');
        console.log('Guest adventure confirmed;',matches,'unchanged Flash records');
    }catch(error){console.error(error.message);process.exitCode=1;}
    finally{clearTimeout(timeout);ws.close();}
};
