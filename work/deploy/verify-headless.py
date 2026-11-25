import pathlib,tarfile,tempfile,sqlite3,shutil,json,hashlib
base=pathlib.Path('/home/dougl/backups/poptropica')
stamp=(base/'last-success-utc').read_text().strip()
assert len(stamp)==16 and stamp.endswith('Z')
archive=base/'scheduled'/(stamp+'.tar.gz')
with tarfile.open(archive) as t,tempfile.TemporaryDirectory(prefix='poptropica-verify-') as tmp:
    members=t.getmembers()
    assert all(not pathlib.PurePosixPath(m.name).is_absolute() and '..' not in pathlib.PurePosixPath(m.name).parts for m in members)
    receipt=json.load(t.extractfile('receipt.json'));release=receipt['release'].lstrip('/')
    wanted={}
    for line in t.extractfile(release+'/deploy/FINAL-SOURCE.sha256').read().decode().splitlines():
        digest,name=line.split(maxsplit=1);wanted[release+'/'+name.lstrip('*').removeprefix('./')]=digest
    checked=0;dbs=[]
    for m in members:
        if m.name in wanted:
            h=hashlib.sha256()
            with t.extractfile(m) as f:
                for chunk in iter(lambda:f.read(1024*1024),b''):h.update(chunk)
            assert h.hexdigest()==wanted.pop(m.name),m.name
            checked+=1
        if m.name.startswith('data/') and m.name.endswith(('.sqlite','.sqlite3')):
            p=pathlib.Path(tmp)/pathlib.Path(m.name).name
            with t.extractfile(m) as src,p.open('wb') as dst:shutil.copyfileobj(src,dst)
            with sqlite3.connect(p.as_uri()+'?mode=ro',uri=True) as c:assert c.execute('pragma integrity_check').fetchone()[0]=='ok'
            dbs.append(m.name)
    assert not wanted
result={'archive':str(archive),'manifest_files':checked,'databases':dbs,'integrity':'ok'}
(base/'latest-restore-check.json').write_text(json.dumps(result,indent=2))
print(json.dumps(result))
