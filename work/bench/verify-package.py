from pathlib import Path
import hashlib
import os
import runpy
import subprocess
import sys
import time

root=Path(__file__).resolve().parents[2]
first=runpy.run_path(str(root/'work/offline/check-window.py'))
qa=first['qa']
work=first['work']
for name in ['Poptropica.exe','offline/catalog.tsv','offline/router.php']:
    installed=next((qa/'Versions').iterdir())/name
    source=root/'work/assembled'/name
    with source.open('rb') as a, installed.open('rb') as b:
        assert hashlib.file_digest(a,'sha256').digest()==hashlib.file_digest(b,'sha256').digest()
assert 'All caught up' in (root/'work/bench/online-settings.log').read_text()
script=(work/'check-window.py').read_text()
script=script.replace('qa = work / ("q"+uuid.uuid4().hex[:5])\nqa.mkdir()',f'qa = Path({str(qa)!r})')
script=script.replace('if not prompt and "No thanks" in controls:', 'if "No thanks" in controls: raise RuntimeError("First-run prompt repeated")\n        if not prompt:')
a=script.index('            assert progress')
b=script.index('            prompt = True',a)
script=script[:a]+'            assert not progress\n'+script[b:]
exec(compile(script,str(work/'check-window.py'),'exec'),{'__file__':str(work/'check-window.py'),'__name__':'__main__'})
print('Final archive rendered the game on both first and second launch, with persisted opt-out and original asset catalog.')
(root/'work/bench/final-qa-root.txt').write_text(str(qa))
