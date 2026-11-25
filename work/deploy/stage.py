from pathlib import Path
import hashlib, json, os, shutil, subprocess, sys, tempfile

root = Path("/srv/poptropica")
old = root/"releases/2026-11-07-gameplay-particles"
dest = root/"releases/2026-11-25-desktop-assets-v2"
release_manifest = Path("deploy/FINAL-SOURCE.sha256")
endpoint = Path("public/api/desktop-assets.php")
tracked_config = Path("deploy/Caddyfile")
live_config = Path("/etc/poptropica/Caddyfile")
expected_manifest, expected_code, expected_tsv = sys.argv[1:4]
php_code = sys.stdin.buffer.read()

def checksum(path):
    with path.open("rb") as f:
        return hashlib.file_digest(f,"sha256").hexdigest()

def permit_catalog(data):
    before = b"@phpAllowed path "
    assert data.count(before)==1 and b"/api/desktop-assets.php" not in data
    assert b"respond @otherPhp 404" in data
    return data.replace(before, before+b"/api/desktop-assets.php ",1)

def caddy_environment():
    pid = subprocess.check_output(["systemctl","show","poptropica-caddy","--value","--property=MainPID"],text=True).strip()
    assert pid.isdecimal() and int(pid)>1
    return dict(entry.split(b"=",1) for entry in Path("/proc",pid,"environ").read_bytes().split(b"\0") if entry)

assert (root/"current").resolve(strict=True) == old
assert not dest.exists() and not (old/endpoint).exists()
assert checksum(old/release_manifest) == expected_manifest
assert hashlib.sha256(php_code).hexdigest() == expected_code
assert shutil.disk_usage(root).free > 4*1024**3
subprocess.run(["sha256sum","--quiet","--check",release_manifest],cwd=old,check=True)
with tempfile.TemporaryDirectory(prefix=".desktop-stage-", dir=dest.parent) as temp:
    stage = Path(temp)/"release"
    subprocess.run(["cp","-a",old,stage],check=True)
    with (stage/endpoint).open("xb") as f:
        f.write(php_code)
    (stage/endpoint).chmod(0o644)
    subprocess.run(["php","-l",stage/endpoint],capture_output=True,check=True)
    (stage/tracked_config).write_bytes(permit_catalog((old/tracked_config).read_bytes()))
    original_live = live_config.read_bytes()
    proposed = Path(temp)/"live-Caddyfile"
    proposed.write_bytes(permit_catalog(original_live))
    for config in [proposed,stage/tracked_config]:
        env=caddy_environment()
        if config==stage/tracked_config:
            env[b"POPTROPICA_SITE"]=b"http://127.0.0.1:18089"
        subprocess.run(["/usr/local/bin/poptropica-caddy","validate","--config",config,"--adapter","caddyfile"],env=env,capture_output=True,check=True)
    manifest = (stage/release_manifest).read_text().splitlines()
    matches=[i for i,line in enumerate(manifest) if line.split(maxsplit=1)[1]=="deploy/Caddyfile"]
    assert len(matches)==1
    manifest[matches[0]]=checksum(stage/tracked_config)+"  deploy/Caddyfile"
    manifest.append(expected_code+"  "+endpoint.as_posix())
    manifest.sort(key=lambda line:line.split(maxsplit=1)[1])
    (stage/release_manifest).write_text("\n".join(manifest)+"\n")
    subprocess.run(["sha256sum","--quiet","--check",release_manifest],cwd=stage,check=True)
    previous = {p.relative_to(old) for p in old.rglob("*") if p.is_file()}
    next_files = {p.relative_to(stage) for p in stage.rglob("*") if p.is_file()}
    assert next_files == previous|{endpoint}
    for name in previous - {release_manifest,tracked_config}:
        a,b=old/name, stage/name
        assert a.stat().st_mode == b.stat().st_mode and a.stat().st_size == b.stat().st_size, name
        assert checksum(a) == checksum(b),name
    tsv=subprocess.check_output(["nice","-n","10","php",str(stage/endpoint),str(stage/"public")])
    assert hashlib.sha256(tsv).hexdigest() == expected_tsv
    assert not dest.exists() and (root/"current").resolve(strict=True) == old
    stage.rename(dest)
fcgi_env={"SCRIPT_FILENAME":str(dest/endpoint),"SCRIPT_NAME":"/api/desktop-assets.php","REQUEST_URI":"/api/desktop-assets.php","REQUEST_METHOD":"GET","DOCUMENT_ROOT":str(dest/"public"),"SERVER_PROTOCOL":"HTTP/1.1","SERVER_NAME":"poptropica.love","HTTP_HOST":"poptropica.love","HTTPS":"on","REMOTE_ADDR":"127.0.0.1","GATEWAY_INTERFACE":"CGI/1.1"}
fcgi=subprocess.run(["/usr/bin/cgi-fcgi","-bind","-connect","/run/php/poptropica.sock"],env=fcgi_env,stdin=subprocess.DEVNULL,capture_output=True,timeout=60,check=True)
header,body=fcgi.stdout.split(b"\r\n\r\n",1)
assert b"Status: 5" not in header and hashlib.sha256(body).hexdigest()==expected_tsv, "Public PHP-FPM pool failed staged GET"
print(json.dumps({"staged":dest.name,"prior":old.name,"unchangedFiles":len(previous)-2,"manifestCount":len(manifest),"manifestSha256":checksum(dest/release_manifest),"endpointSha256":expected_code,"catalogSha256":expected_tsv,"catalogBytes":len(tsv),"catalogRecords":tsv.count(b"\n"),"baselineConfig":checksum(old/tracked_config),"stagedConfig":checksum(dest/tracked_config),"previousLiveConfig":hashlib.sha256(original_live).hexdigest(),"nextLiveConfig":hashlib.sha256(permit_catalog(original_live)).hexdigest()}))
