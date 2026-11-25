from pathlib import Path, PurePosixPath
import gzip, hashlib, io, json, sqlite3, shutil, tarfile, tempfile
from contextlib import closing

private = Path(__file__).resolve().parent / "private-20261125"
archive = private / "pre-desktop-assets-20261125.tar.gz"
baseline = "srv/poptropica/releases/2026-11-07-gameplay-particles/"
expected = "b99d24ca09221b2c5c8207c440d9572df1b6a8105f1fb0783ca6c3e2f70e269f"
hashes, dbs, manifest, receipt = {}, [], None, None
with tempfile.TemporaryDirectory(prefix="restore-", dir=private) as temp:
    with gzip.open(archive, "rb") as gz, tarfile.open(fileobj=gz, mode="r|") as tar:
        for member in tar:
            path = PurePosixPath(member.name)
            assert not path.is_absolute() and ".." not in path.parts
            if not member.isfile():
                continue
            stream = tar.extractfile(member)
            if member.name.startswith(baseline):
                name = member.name[len(baseline):]
                assert name not in hashes
                if name == "deploy/FINAL-SOURCE.sha256":
                    manifest = stream.read()
                    hashes[name] = hashlib.sha256(manifest).hexdigest()
                else:
                    hashes[name] = hashlib.file_digest(stream, "sha256").hexdigest()
            elif member.name == "receipt.json":
                receipt = json.load(stream)
            elif path.parts[0] == "data" and path.suffix in (".sqlite", ".sqlite3"):
                testfile = Path(temp)/f"snapshot-{len(dbs)}.sqlite"
                with testfile.open("xb") as out:
                    shutil.copyfileobj(stream, out)
                with closing(sqlite3.connect(testfile.as_uri()+"?mode=ro&immutable=1",uri=True)) as db:
                    assert db.execute("pragma integrity_check").fetchall() == [("ok",)]
                dbs.append({"path":member.name,"bytes":member.size,"integrity":"ok"})
        while gz.read(1024*1024):
            pass
assert receipt["release"] == "/"+baseline.rstrip("/")
assert hashes["deploy/FINAL-SOURCE.sha256"] == expected
entries = [line.split(maxsplit=1) for line in manifest.decode().splitlines()]
assert len(entries) == 1523 and len(dbs) == 3
for digest, name in entries:
    assert hashes.get(name.lstrip("*")) == digest, name
with archive.open("rb") as stream:
    checksum = hashlib.file_digest(stream,"sha256").hexdigest()
result = {"backup":archive.name,"bytes":archive.stat().st_size,"sha256":checksum,"release":receipt["release"],"manifestSha256":expected,"manifestFilesVerified":len(entries),"releaseFiles":len(hashes),"databases":dbs,"createdUtc":receipt["utc"]}
(private/"backup-verification.json").write_text(json.dumps(result,indent=2))
print(json.dumps(result))
