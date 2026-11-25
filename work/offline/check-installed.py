from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import hashlib
import os
import sys

work = Path(__file__).resolve().parent
source = work.parents[1] / "work/assembled"
target = Path(sys.argv[1]).resolve()
assert target.is_relative_to(work) and (target/"complete").is_file()
def inventory(folder):
    return {os.path.relpath(os.path.join(path,name),folder) for path,_,files in os.walk(folder) for name in files}
files = inventory(source)
assert inventory(target) == files | {"complete"}
def compare(name):
    a = source/name
    b = target/name
    assert a.stat().st_size == b.stat().st_size,name
    with a.open("rb") as left, b.open("rb") as right:
        assert hashlib.file_digest(left,"sha256").digest() == hashlib.file_digest(right,"sha256").digest(),name
    return a.stat().st_size
with ThreadPoolExecutor(max_workers=8) as workers:
    amount = sum(workers.map(compare,sorted(files)))
print(len(files),"installed payload files match the build,",amount,"bytes")
