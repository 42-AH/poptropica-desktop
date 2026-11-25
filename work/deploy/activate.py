from pathlib import Path
import hashlib, json, os, re, signal, stat, subprocess, sys, tempfile, time, urllib.error, urllib.request

root=Path("/srv/poptropica")
old=root/"releases/2026-11-07-gameplay-particles"
new=root/"releases/2026-11-25-desktop-assets-v2"
current=root/"current"
manifest,code,catalog,prior_config,next_config=sys.argv[1:6]
assert current.resolve(strict=True)==old
def hash_bytes(data):
    return hashlib.sha256(data).hexdigest()
assert hash_bytes((new/"deploy/FINAL-SOURCE.sha256").read_bytes())==manifest
assert hash_bytes((new/"public/api/desktop-assets.php").read_bytes())==code
assert not (old/"public/api/desktop-assets.php").exists()
subprocess.run(["sha256sum","--quiet","--check","deploy/FINAL-SOURCE.sha256"],cwd=new,check=True)
def switch(expected,destination):
    assert current.resolve(strict=True)==expected
    temporary=root/f".switch-desktop-{os.getpid()}"
    temporary.symlink_to(destination)
    os.replace(temporary,current)
def fetch(path,method="GET",headers=None):
    req=urllib.request.Request("https://poptropica.love"+path,method=method,headers=headers or {})
    with urllib.request.urlopen(req,timeout=45) as resp:
        return resp.status, resp.read(),resp.headers
live=Path("/etc/poptropica/Caddyfile")
original=live.read_bytes()
assert hash_bytes(original)==prior_config and original.count(b"@phpAllowed path ")==1
proposed=original.replace(b"@phpAllowed path ",b"@phpAllowed path /api/desktop-assets.php ",1)
assert hash_bytes(proposed)==next_config
pid=subprocess.check_output(["systemctl","show","poptropica-caddy","--value","--property=MainPID"],text=True).strip()
assert pid.isdecimal() and int(pid)>1
caddyenv=dict(entry.split(b"=",1) for entry in Path("/proc",pid,"environ").read_bytes().split(b"\0") if entry)
cmd=Path("/proc",pid,"cmdline").read_bytes().split(b"\0")
assert b"run" in cmd and b"--resume" not in cmd and os.fsencode(live) in cmd
version=subprocess.check_output(["/usr/local/bin/poptropica-caddy","version"],text=True)
version_numbers=re.match(r"v(\d+)\.(\d+)",version)
assert version_numbers and tuple(map(int,version_numbers.groups()))>=(2,11)
def config_replace(data):
    record=live.stat()
    with tempfile.NamedTemporaryFile(prefix=".desktop-caddy-",dir=live.parent,delete=False) as f:
        temp=Path(f.name)
        f.write(data)
        f.flush()
        os.fchmod(f.fileno(),stat.S_IMODE(record.st_mode))
        os.fchown(f.fileno(),record.st_uid,record.st_gid)
        os.fsync(f.fileno())
    temp.replace(live)
def reload():
    assert subprocess.check_output(["systemctl","show","poptropica-caddy","--value","--property=MainPID"],text=True).strip()==pid
    os.kill(int(pid),signal.SIGUSR1)
    time.sleep(1)
def reload_php():
    subprocess.run(["systemctl","reload","php8.3-fpm"],check=True)
    subprocess.run(["systemctl","is-active","--quiet","php8.3-fpm"],check=True)
rollback_path=Path("/var/backups/poptropica-desktop-20261125-pre-catalog.Caddyfile")
if rollback_path.exists():
    assert rollback_path.read_bytes()==original
else:
    with rollback_path.open("xb") as f:
        os.fchmod(f.fileno(),0o600)
        f.write(original)
try:
    switch(old,new)
    config_replace(proposed)
    reload_php()
    reload()
    status,body,_=fetch("/play/")
    assert status==200 and hash_bytes(body)==hash_bytes((new/"public/play/index.html").read_bytes())
    for attempt in range(4):
        try:
            status,body,headers=fetch("/api/desktop-assets.php")
            break
        except urllib.error.HTTPError as e:
            if e.code!=404 or attempt==3: raise
            time.sleep(1)
    assert status==200 and hash_bytes(body)==catalog
    assert headers.get("ETag")=='"'+catalog+'"'
    status,empty,head=fetch("/api/desktop-assets.php","HEAD")
    assert status==200 and empty==b'' and head.get("ETag")==headers.get("ETag")
    try:
        fetch("/api/desktop-assets.php",headers={"If-None-Match":headers.get("ETag")})
        raise RuntimeError("Conditional GET did not return 304")
    except urllib.error.HTTPError as e:
        assert e.code==304
    try:
        fetch("/api/never-allow-desktop-probe.php")
        raise RuntimeError("Unlisted PHP route became accessible")
    except urllib.error.HTTPError as e:
        assert e.code==404
    for service in ["nginx","poptropica-caddy","php8.3-fpm","mysql","pm2-root"]:
        subprocess.run(["systemctl","is-active","--quiet",service],check=True)
    assert current.resolve(strict=True)==new
except BaseException:
    if current.resolve(strict=True)==new:
        switch(new,old)
        reload_php()
    if live.read_bytes()==proposed:
        config_replace(original)
        reload()
    print("Restored prior release and Caddy configuration.",file=sys.stderr)
    raise
print(json.dumps({"active":new.name,"rollback":old.name,"play":200,"catalog":200,"head":200,"conditional":304,"catalogBytes":len(body),"catalogSha256":catalog,"manifestSha256":manifest,"services":"active"}))
