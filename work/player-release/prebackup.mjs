import fs from 'node:fs';
import {run} from '../deploy/access.mjs';
const reach=await run('home','true').then(()=>true,()=>false);
if(reach){
 await run('home','/home/dougl/bin/poptropica-backup');
 const check=fs.readFileSync(new URL('../deploy/verify-headless.py',import.meta.url),'utf8');
 const result=JSON.parse(await run('home','python3 -',check.replace("print(json.dumps(result))","result['release']=receipt['release'];print(json.dumps(result))")));
 if(result.release!='/srv/poptropica/releases/2026-11-25-desktop-assets-v2'||result.manifest_files!=1524||result.databases.length!==3)throw Error('Unexpected headless backup');
 fs.writeFileSync(new URL('./private/home-backup.json',import.meta.url),JSON.stringify(result));console.log('Headless backup verified.');
}else{console.log('Headless PC unavailable; using authorized Windows backup.');await import('./backup.mjs');}
