import {run} from '../deploy/access.mjs';
console.log(await run('target',`set -eu
rel=$(readlink -f /srv/poptropica/current)
systemctl show poptropica-caddy --property=FragmentPath
for file in /etc/poptropica/Caddyfile "$rel/deploy/Caddyfile"; do
 if test -f "$file"; then
  printf '%s\\n' "$file"
  grep -F '@phpAllowed path' "$file" | cut -c1-160
  grep -F 'respond @otherPhp' "$file"
  grep -Fc '/api/desktop-assets.php' "$file" || true
 fi
done
systemctl cat poptropica-caddy | grep -E '^Exec(Start|Reload)=' | cut -c1-240
`));
