from pathlib import Path
import hashlib
import json
import os
import re
import runpy
import shutil
import struct

root = Path(__file__).resolve().parents[2]
out = root / "work/assembled/offline"
docs = root.parents[1]
candidate = docs / "2026-09-19/continue-maintaining-my-existing-poptropica-love/work/dead-air/candidate"
audit = docs / "2026-10-18/con/work/renderer-investigation"
php = docs / "2026-09-12/i-wa/work/php-8.4.25"
matched = {k: Path(v) for k,v in json.loads((audit / "matched-files.json").read_text()).items()}
expected = {}
for line in (audit / "live-manifest.sha256").read_text().splitlines():
    match = re.fullmatch(r'([0-9a-f]{64})\s+\*?public/(.+)', line)
    if match:
        expected[match[2]] = match[1]
assert set(matched) == set(expected)
for rel, source in matched.items():
    assert hashlib.sha256(source.read_bytes()).hexdigest() == expected[rel], rel
public = candidate / "public"
files = {p.relative_to(public).as_posix():p for p in public.rglob("*") if p.is_file()}
files.update(matched)
asset_dirs = set("archived-quantserve avatarParts externalAssets framework game images items popups scenes video".split())
asset_types = set(".swf .xml .gif .jpg .png .mp3 .flv .pop .txt".split())
root_files = {p.name for p in public.iterdir() if p.suffix == ".php"} | {"web-config.js","favicon.ico","favicon.png","game/index.html","play/index.html","play/manifest.webmanifest"}
plugin_names = set("AmfphpAuthentication AmfphpCharsetConverter AmfphpErrorHandler AmfphpFlexMessaging".split())
def include(rel):
    path = Path(rel)
    folder = path.parts[0]
    if rel in root_files or (len(path.parts) == 1 and path.suffix == ".swf"):
        return True
    if folder in asset_dirs:
        return path.suffix.lower() in asset_types
    if folder in {"brain","comics","creatorClips","games","photos"}:
        return path.suffix == ".php" and rel in expected
    if folder == "AMFPHP":
        return path.suffix == ".php" and ("Plugins" not in path.parts or path.parts[2] in plugin_names)
    if folder == "cloud":
        return not path.name.startswith(("admin","analytics","code-history"))
    if folder == "ruffle":
        return path.suffix in {".js",".wasm"} or path.name in {"LICENSE_APACHE","LICENSE_MIT"}
    return False

def copy(src, dest):
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(src, dest)

included = []
for rel, source in files.items():
    if include(rel):
        copy(source, out / "public" / rel)
        included.append(rel)
for name in ("legacy-static.php","legacy-catalog.php","legacy-island-names.json"):
    copy(candidate / "server" / name, out / "server" / name)

def extract_function(src, name):
    text = (candidate / "server" / src).read_text(encoding="utf-8")
    return re.search(r'^function '+name+r'\(.*?^\}', text, re.M | re.S)[0]

(out / "server/photos.php").write_text("<?php\n"+extract_function("photos.php","photos_catalog")+"\n",encoding="utf-8")
(out / "server/social.php").write_text("<?php\n"+extract_function("social-network.php","social_chat_catalog")+"\n"+extract_function("legacy-social.php","social_legacy_questions")+"\n",encoding="utf-8")

def imports(path):
    data = path.read_bytes()
    pe = struct.unpack_from("<I", data, 60)[0]
    sections, optional_size = struct.unpack_from("<H12xH",data,pe+6)
    optional = pe+24
    assert struct.unpack_from("<H",data,optional)[0] == 0x20b
    base = optional + optional_size
    def offset(rva):
        for section in range(sections):
            size,address,raw_size,raw = struct.unpack_from("<IIII",data,base+section*40+8)
            if address <= rva < address+max(size,raw_size):
                return raw+rva-address
        raise ValueError(rva)
    table = offset(struct.unpack_from("<I",data,optional+120)[0])
    while (name := struct.unpack_from("<I",data,table+12)[0]):
        loc = offset(name)
        yield data[loc:data.index(0,loc)].decode().lower()
        table += 20

runtime_files = {p.name.lower():p for p in php.iterdir() if p.is_file()}
queue = [php/"php.exe"]
installed = set()
while queue:
    source = queue.pop()
    if source in installed:
        continue
    installed.add(source)
    destination = out/"runtime"/source.name
    if not destination.is_file() or destination.read_bytes() != source.read_bytes():
        copy(source,destination)
    for dll in imports(source):
        if dll in runtime_files:
            queue.append(runtime_files[dll])
        elif dll.startswith(("vcruntime","msvcp","concrt")):
            redist = Path(os.environ["ProgramFiles(x86)"])/"Microsoft Visual Studio/2022/BuildTools/VC/Redist/MSVC"
            queue.append(next(redist.glob("*/x64/Microsoft.VC143.CRT/"+dll)))
for name in ["license.txt","readme-redist-bins.txt"]:
    copy(php/name,out/"runtime"/name)
print("Bundled",len(included),"public files;",len(set(included)&set(expected)),"validated release files;",len(expected),"verified public records.",flush=True)
print(sorted(p.name for p in installed),flush=True)
runpy.run_path(str(Path(__file__).with_name("adapt.py")))
catalog = root/"work/catalog/live.tsv"
for row in catalog.read_text(encoding="utf-8").splitlines():
    digest, size, rel = row.split("\t",2)
    asset = out/"public"/rel
    if asset.stat().st_size != int(size) or hashlib.sha256(asset.read_bytes()).hexdigest() != digest:
        raise RuntimeError("Asset differs from release: "+rel)
copy(catalog,out/"catalog.tsv")
