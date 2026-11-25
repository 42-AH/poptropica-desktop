import argparse
import hashlib
import os
from pathlib import Path
import struct
import subprocess
import time
import uuid

work = Path(__file__).resolve().parent
parser = argparse.ArgumentParser()
parser.add_argument("--exe",type=Path,default=work/"test-pack.exe")
parser.add_argument("--qa-root",type=Path)
args = parser.parse_args()
exe = args.exe.resolve()
qa = args.qa_root.resolve() if args.qa_root else work/("r"+uuid.uuid4().hex[:5])
assert qa.is_relative_to(work)
with exe.open("rb") as file:
    file.seek(-64,2)
    _,_,_,digest,magic = struct.unpack("<qqq32s8s",file.read(64))
assert magic==b"POPLOVE1"
version=digest.hex()
versions=qa/"Versions"
target=versions/version[:24]
stage=versions/(".unpack-"+version[:24])
env=dict(os.environ,POPTROPICA_DESKTOP_QA_ROOT=str(qa))
def extract(path,ok=True):
    result=subprocess.run([exe,"--extract-to",path],env=env,timeout=240)
    assert (result.returncode==0)==ok,(result.returncode,path)

qa.mkdir(exist_ok=True)
profile=qa/"Profile"
profile.mkdir(exist_ok=True)
note=profile/"recovery-check.txt"
note.write_bytes(os.urandom(24))
sentinel=note.read_bytes()
def persisted():
    return {
        p.relative_to(profile).as_posix():hashlib.sha256(p.read_bytes()).hexdigest()
        for p in profile.rglob("*")
        if p.is_file() and (p.name=="automatic-updates" or ("leveldb" in str(p).lower() and (p.suffix in {".ldb",".log"} or p.name=="CURRENT" or p.name.startswith("MANIFEST-"))))
    }
baseline = persisted()
if args.qa_root:
    assert "automatic-updates" in baseline and any("Local Storage/" in key for key in baseline)
if not target.is_dir():
    (stage/"files").mkdir(parents=True)
    (stage/"owner").write_text(version)
    (stage/"files/incomplete").write_text("partial bundle")
    extract(target)
    assert not stage.exists()

critical=target/"offline/public/ruffle/172de42e6619eac8f371.wasm"
if not critical.exists(): critical=target/"Poptropica.exe"
with critical.open("rb") as file:
    correct=hashlib.file_digest(file,"sha256").digest()
with critical.open("r+b") as file:
    file.seek(-1,2)
    previous=file.read(1)
    file.seek(-1,2)
    file.write(bytes([previous[0]^255]))
(target/"recovery-note.txt").write_text("keep")
t0=time.monotonic()
extract(target)
print("Recovered",critical.name,"in",round(time.monotonic()-t0,2),"seconds",flush=True)
with critical.open("rb") as file:
    assert hashlib.file_digest(file,"sha256").digest()==correct
assert not (target/"recovery-note.txt").exists()
assert any((old/"recovery-note.txt").read_text()=="keep" for old in versions.glob("recovered-*"))
assert note.read_bytes()==sentinel
assert persisted()==baseline
assert not stage.exists()
timestamp=critical.stat().st_mtime_ns
warm=time.monotonic()
extract(target)
print("Validated warm startup files in",round(time.monotonic()-warm,2),"seconds",flush=True)
assert critical.stat().st_mtime_ns==timestamp

stage.mkdir()
(stage/"owner").write_text(version)
target.rename(stage/"files")
extract(target)
assert critical.stat().st_mtime_ns==timestamp and not stage.exists()
other=qa/"unrelated"
other.mkdir(exist_ok=True)
(other/"keep").write_text("safe")
extract(other,False)
assert (other/"keep").read_text()=="safe"
print("Passed damaged-file recovery, warm restart, staged restart and unrelated-folder protection.",qa)
