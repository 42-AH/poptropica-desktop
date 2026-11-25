import fs from 'node:fs';
import crypto from 'node:crypto';
import {run} from '../deploy/access.mjs';
const dir=new URL('./private-20261125/',import.meta.url);
const source=new URL('../catalog/desktop-assets.php',import.meta.url);
const catalog=new URL('../catalog/live.tsv',import.meta.url);
const op=process.argv[2];
const hash=buf=>crypto.createHash('sha256').update(buf).digest('hex');
const baseline='b99d24ca09221b2c5c8207c440d9572df1b6a8105f1fb0783ca6c3e2f70e269f';
const backup=JSON.parse(fs.readFileSync(new URL('backup-verification.json',dir)));
if (backup.manifestSha256!==baseline || backup.manifestFilesVerified!==1523 || backup.databases.length!==3)throw Error('Missing verified baseline backup');
const code=fs.readFileSync(source),codeSha=hash(code),catalogSha=hash(fs.readFileSync(catalog));
let args;
if(op==='stage'){
  args=[baseline,codeSha,catalogSha];
}else if(op==='activate'){
  const stage=JSON.parse(fs.readFileSync(new URL('stage.json',dir)));
  if(stage.endpointSha256!==codeSha || stage.catalogSha256!==catalogSha)throw Error('Sources differ from verified stage');
  args=[stage.manifestSha256,codeSha,catalogSha,stage.previousLiveConfig,stage.nextLiveConfig];
}else throw Error('Choose stage or activate');
const program=fs.readFileSync(new URL('./'+op+'.py',import.meta.url)).toString('base64');
const result=JSON.parse(await run('target',`python3 -c "import base64; exec(compile(base64.b64decode('${program}'),'${op}.py','exec'))" `+args.join(' '),op==='stage'?code:undefined));
fs.writeFileSync(new URL(op+'.json',dir),JSON.stringify({...result,utc:new Date().toISOString()},null,2));
if(op==='stage'){
  fs.copyFileSync(source,new URL('desktop-assets-20261125.php',dir));
  const kept=new URL('desktop-assets-20261125-source/',dir);
  const previousConfig=fs.readFileSync(process.env.POPTROPICA_BASELINE_CADDYFILE);
  const nextConfig=Buffer.from(previousConfig.toString().replace('@phpAllowed path ','@phpAllowed path /api/desktop-assets.php '));
  if(hash(previousConfig)!==result.baselineConfig || hash(nextConfig)!==result.stagedConfig)throw Error('Local Caddyfile differs from verified release');
  for (const name of ['deploy/','public/api/'])fs.mkdirSync(new URL(name,kept),{recursive:true});
  fs.writeFileSync(new URL('deploy/Caddyfile',kept),nextConfig);
  fs.writeFileSync(new URL('public/api/desktop-assets.php',kept),code);
  fs.writeFileSync(new URL('desktop-assets-20261125-delta.json',dir),JSON.stringify({release:result.staged,basedOn:result.prior,previousManifestSha256:baseline,manifestSha256:result.manifestSha256,files:[{action:'add',path:'public/api/desktop-assets.php',sha256:codeSha},{action:'allow exact PHP endpoint',path:'deploy/Caddyfile',before:result.baselineConfig,sha256:result.stagedConfig},{action:'allow exact PHP endpoint',path:'/etc/poptropica/Caddyfile',before:result.previousLiveConfig,sha256:result.nextLiveConfig}],catalogSha256:catalogSha},null,2));
}
console.log(JSON.stringify(result));
