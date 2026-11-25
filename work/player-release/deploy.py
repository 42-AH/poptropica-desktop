import base64
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
from urllib.request import urlopen

root = Path("/srv/poptropica")
old = root/"releases/2026-11-25-desktop-assets-v2"
new = root/"releases/2026-11-25-signed-player-updates"
current = root/"current"
manifest = Path("deploy/FINAL-SOURCE.sha256")
feed = Path("public/desktop/player/v1")
digest = "b0c4a04af7c5b6f9e799a1f5aeff72ce4bab8f8b9f653d848a7b939de9878c1c"
def sha(data):
    return hashlib.sha256(data).hexdigest()
def switch(expected, target):
    assert current.resolve(strict=True) == expected
    link = root/(".player-switch-"+str(os.getpid()))
    link.symlink_to(target)
    os.replace(link,current)
def reload_php():
    subprocess.run(["systemctl","reload","php8.3-fpm"],check=True)
def public(path):
    with urlopen("https://poptropica.love/"+path,timeout=90) as response:
        return response.read()
assert current.resolve(strict=True) == old and not new.exists()
assert sha((old/manifest).read_bytes()) == "85eba7c91539f95662d66da5790cfdc7254654fa640d4991cc39763a7ad10b53"
assert not (old/feed).exists() and shutil.disk_usage(root).free > 4*1024**3
files = {name:base64.b64decode(data,validate=True) for name,data in json.load(sys.stdin).items()}
assert set(files) == {"latest.txt",digest+".bin"}
assert sha(files[digest+".bin"]) == digest and files["latest.txt"].decode().splitlines()[1:4] == ["1.1.0.0","98304",digest]
with tempfile.TemporaryDirectory(dir=new.parent) as temp:
    stage = Path(temp)/"release"
    subprocess.run(["cp","-a",old,stage],check=True)
    (stage/feed).mkdir(parents=True)
    lines = (stage/manifest).read_text().splitlines()
    for name,data in files.items():
        path = feed/name
        (stage/path).write_bytes(data)
        (stage/path).chmod(0o644)
        lines.append(sha(data)+"  "+str(path))
    (stage/manifest).write_text("\n".join(sorted(lines,key=lambda line:line.split(maxsplit=1)[1]))+"\n")
    subprocess.run(["sha256sum","--quiet","--check",manifest],cwd=stage,check=True)
    stage.rename(new)
try:
    switch(old,new)
    reload_php()
    for name,data in files.items():
        assert public("desktop/player/v1/"+name) == data
    assert public("play/") == (new/"public/play/index.html").read_bytes()
    assert sha(public("api/desktop-assets.php")) == "68616f0c56b6813787b398f4df7b5fe860741f7fb89216687f715451024a2f3f"
    for service in ("nginx","poptropica-caddy","php8.3-fpm","mysql","pm2-root"):
        subprocess.run(["systemctl","is-active","--quiet",service],check=True)
except BaseException:
    if current.resolve()==new:
        switch(new,old)
        reload_php()
    raise
print(json.dumps(dict(active=new.name,rollback=old.name,manifestSha256=sha((new/manifest).read_bytes()),payloadSha256=digest)))
