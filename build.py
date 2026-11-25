import argparse
import hashlib
from pathlib import Path
import shutil
import subprocess
import sys

root = Path(__file__).resolve().parent
parser = argparse.ArgumentParser()
parser.add_argument("--release", type=Path)
args = parser.parse_args()
assembled = root / "work/assembled"
if not assembled.exists():
    if not args.release:
        parser.error("--release requires the Poptropica.exe asset from v1.1.4 on the first build")
    release = args.release.resolve(strict=True)
    with release.open("rb") as stream:
        if hashlib.file_digest(stream, "sha256").hexdigest() not in {
            "5bee1044903f7ae68f129e9ff19ce2dc1149fb2649b44c75339eb0ce5b8ca4a9",
            "ce340402de72d78325c22e5114f036ead2358a36d49610d21e882492c21817ef",
            "ff2735dd5306a126bd79e333ca156388112540e8579bf3688410ebcac006c632",
        }:
            parser.error("The release asset checksum does not match a supported build asset")
    subprocess.run([release, "--extract-to", assembled], check=True)
    (assembled / "complete").unlink()
offline = assembled / "offline"
shutil.copytree(root / "game", offline, dirs_exist_ok=True)
shutil.copyfile(root / "work/offline/router.php", offline / "router.php")
subprocess.run(["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", root / "work/launcher/build.ps1"], check=True)
subprocess.run([sys.executable, root / "work/offline/package.py"], check=True)
