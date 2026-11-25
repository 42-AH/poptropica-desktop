import {run} from '../deploy/access.mjs';
console.log(await run('target',`set -eu
readlink -f /srv/poptropica/current
sha256sum /etc/poptropica/Caddyfile
grep -Ei '^(user|group|listen)( |=)|open_basedir|sys_temp_dir|disable_functions|memory_limit|error_log' /etc/php/8.3/fpm/pool.d/poptropica.conf
grep -hE '^opcache\.(enable|validate_timestamps|revalidate_path|revalidate_freq)|^realpath_cache_ttl' /etc/php/8.3/fpm/php.ini /etc/php/8.3/fpm/conf.d/* || true
systemctl show php8.3-fpm -p PrivateTmp -p ProtectSystem -p ReadWritePaths
command -v cgi-fcgi || true
ls -d /tmp/systemd-private-*-php8.3-fpm.service-*/tmp/poptropica-desktop-* /tmp/poptropica-desktop-* 2>/dev/null | wc -l
python3 - <<'PY'
import subprocess,json,re
p=subprocess.run(['journalctl','-u','poptropica-caddy','--since','-6 minutes','-o','cat'],capture_output=True,text=True)
for line in p.stdout.splitlines():
 if 'desktop-assets.php' not in line:continue
 patterns=[r'open_basedir restriction in effect',r'Permission denied',r'Allowed memory size of \d+ bytes exhausted',r'Call to undefined function [a-zA-Z_]+',r'No space left on device',r'No such file or directory',r'Operation not permitted',r'Unable to create']
 print('PHP diagnostic categories:',sorted(set(s for pat in patterns for s in re.findall(pat,line))), 'old tmp path:', '/tmp/poptropica-desktop-' in line, 'site cache path:', '/desktop-assets-cache' in line)
PY
curl -fsS -o /dev/null -w '%{http_code}\\n' https://poptropica.love/play/
`));
