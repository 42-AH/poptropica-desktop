import fs from 'node:fs';
import {Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {once} from 'node:events';
import {ssh} from '../deploy/access.mjs';
const dest=new URL('./private/pre-player-feed.tar.gz.part',import.meta.url);
const child=ssh('target',`set -eu
test "$(basename "$(readlink -f /srv/poptropica/current)")" = '2026-11-25-desktop-assets-v2'
test "$(sha256sum /usr/local/lib/poptropica/export-backup.py | cut -c1-64)" = 'dd106489533f2be165f5127f19283997bdf390199130e161d7a506a22e3fcb03'
exec nice -n 10 /usr/local/lib/poptropica/export-backup.py`);
child.stdin.end();child.stderr.resume();
let bytes=0;
const guard=new Transform({transform(chunk,enc,done){bytes+=chunk.length;done(bytes>2*1024**3?Error('Backup limit exceeded'):null,chunk);}});
try{
  const [[status]]=await Promise.all([once(child,'close'),pipeline(child.stdout,guard,fs.createWriteStream(dest,{flags:'wx'}))]);
  if(status!==0)throw Error('Exporter failed with status '+status);
  fs.renameSync(dest,new URL('./private/pre-player-feed.tar.gz',import.meta.url));
  console.log('Transferred '+bytes+' bytes');
}finally{child.kill();}
