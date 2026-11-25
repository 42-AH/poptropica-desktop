import fs from 'node:fs';
import {run} from '../deploy/access.mjs';
const php=fs.readFileSync(new URL('./desktop-assets.php',import.meta.url));
const catalog=await run('target','nice -n 10 php -- /srv/poptropica/current/public',php);
if (!catalog.startsWith(catalog.match(/^[0-9a-f]{64}\t/)?.[0]??'invalid') || catalog.length<2500000) throw Error('Unexpected release catalog');
fs.writeFileSync(new URL('./live.tsv',import.meta.url), catalog);
console.log('Read '+catalog.trimEnd().split('\n').length+' public asset records.');
