from pathlib import Path
import argparse
import gzip
import hashlib
import os
import re
import shutil
import struct
import subprocess

work = Path(__file__).resolve().parent
root = work.parents[1]
source = root / "work/assembled"
parser = argparse.ArgumentParser()
parser.add_argument("--fixture",action="store_true")
parser.add_argument("--output",type=Path)
args = parser.parse_args()
test = args.fixture
product = args.output.resolve() if args.output else (work / "test-pack.exe" if test else root / "outputs/Poptropica.exe")
product.parent.mkdir(parents=True,exist_ok=True)
stub = work / "stub.exe"
compiler = Path(os.environ["WINDIR"])/"Microsoft.NET/Framework64/v4.0.30319/csc.exe"
launcher = root / "work/launcher"
if test:
    paths = [source/"Poptropica.exe", source/"offline/public/game/Shell.swf", source/"offline/public/game/index.html"]
else:
    paths = sorted(p for p in source.rglob("*") if p.is_file())
    assert (source/"offline/catalog.tsv") in paths and (source/"Poptropica.exe") in paths
startup = [p for p in paths if p.parent == source or p.parent == source/"offline/runtime" and p.suffix in {".exe",".dll"}]
startup += [p for p in paths if p.relative_to(source).as_posix() in {
    "offline/catalog.tsv", "offline/router.php", "offline/overlay/play/index.html", "offline/overlay/cloud/game-loader.js",
    "offline/overlay/cloud/play.mjs", "offline/public/game/Shell.swf", "offline/public/game/ShellLoader.swf",
    "offline/public/game/index.html", "offline/public/ruffle/ruffle.js", "offline/public/web-config.js"
}]
if not test:
    runtime = source/"offline/public/ruffle"
    loader = (runtime/"ruffle.js").read_text(encoding="utf-8")
    chunks = [p for p in runtime.iterdir() if p.suffix in {".js",".wasm"} and any(key in loader for key in re.findall(r"[0-9a-f]{20}",p.name))]
    assert any(p.suffix==".wasm" for p in chunks) and any(p.suffix==".js" for p in chunks)
    startup.extend(sorted(chunks))
checks = work/"startup-files.tsv"
with checks.open("w",encoding="utf-8",newline="\n") as record:
    for path in startup:
        with path.open("rb") as data:
            record.write(f"{hashlib.file_digest(data,'sha256').hexdigest()}\t{path.relative_to(source).as_posix()}\n")
subprocess.run([str(compiler),"/nologo","/target:winexe","/platform:x64","/optimize+",f"/out:{stub}",f"/win32icon:{launcher/'game.ico'}",f"/win32manifest:{launcher/'app.manifest'}",f"/resource:{source/'offline/public/cloud/fonts/CreativeBlock.ttf'},GameFont",f"/resource:{checks},StartupFiles",f"/resource:{work/'wordmark.png'},PoptropicaWordmark","/reference:System.Windows.Forms.dll","/reference:System.Drawing.dll","/reference:System.IO.Compression.dll",str(work/"Pack.cs"),str(work/"GameHost.cs"),str(root/"work/player-release/PlayerRelease.cs"),f"/resource:{root/'work/player-release/player-public.key'},PlayerReleaseKey"],check=True)
size = sum(p.stat().st_size for p in paths)
stage = work/"package.partial"
with stage.open("wb") as output:
    with stub.open("rb") as exe:
        shutil.copyfileobj(exe,output)
    start = output.tell()
    with gzip.GzipFile(filename="",fileobj=output,mode="wb",compresslevel=2,mtime=0) as archive:
        archive.write(struct.pack("<I",len(paths)))
        for path in paths:
            name = path.relative_to(source).as_posix().encode("utf-8")
            archive.write(struct.pack("<Hq",len(name),path.stat().st_size))
            archive.write(name)
            with path.open("rb") as data:
                shutil.copyfileobj(data,archive,1024*1024)
    compressed = output.tell()-start
with stage.open("r+b") as output:
    output.seek(start)
    digest = hashlib.file_digest(output,"sha256").digest()
    output.seek(0,2)
    output.write(struct.pack("<qqq32s8s",start,compressed,size,digest,b"POPLOVE1"))
os.replace(stage,product)
print(f"{product.name}: {len(paths)} files; {size:,} bytes expanded; {product.stat().st_size:,} bytes packaged")

