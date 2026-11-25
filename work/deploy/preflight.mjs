import {run} from '../deploy/access.mjs';
const result=await run('target',`set -eu
rel=$(readlink -f /srv/poptropica/current)
readlink -f /srv/poptropica/current
sha256sum "$rel/deploy/FINAL-SOURCE.sha256"
du -sb "$rel" /var/lib/poptropica /etc/poptropica /usr/local/lib/poptropica
df -PB1 /srv/poptropica
sha256sum /usr/local/lib/poptropica/export-backup.py
test ! -e "$rel/public/api/desktop-assets.php"
stat -c '%a %U %G' "$rel" "$rel/public/api" "$rel/public/api/cloud.php"
wc -l "$rel/deploy/FINAL-SOURCE.sha256"
find "$rel" -type l | wc -l
curl -fsS -o /dev/null -w '%{http_code}\\n' https://poptropica.love/play/
`);
console.log(result);
