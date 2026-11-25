from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError
import hashlib
import json
import os
import socket
import subprocess
import tempfile
import time

work = Path(__file__).resolve().parent
offline = work.parents[1] / "work/assembled/offline"
public = offline / "public"
with tempfile.TemporaryDirectory(dir=work) as temp:
    generation = Path(temp)
    for sub in ["files", "removed"]:
        (generation/sub/"game").mkdir(parents=True)
    (generation/"files/game/update-test.xml").write_text("<updated/>")
    (generation/"removed/game/test-deleted.xml").touch()
    (generation/"files/game/test-deleted.xml").write_text("<stale/>")
    with socket.socket() as listener:
        listener.bind(("127.0.0.1",0))
        port = listener.getsockname()[1]
    host = f"http://127.0.0.1:{port}"
    env = dict(os.environ,POPTROPICA_DESKTOP_TOKEN="local-test",POPTROPICA_DESKTOP_GENERATION=str(generation))
    process = subprocess.Popen([offline/"runtime/php.exe","-n","-S",f"127.0.0.1:{port}","-t",public,offline/"router.php"],cwd=public,env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,creationflags=subprocess.CREATE_NO_WINDOW)
    def fetch(path, expected=200, **kwargs):
        req = Request(host+path,**kwargs)
        try:
            response = urlopen(req,timeout=8)
        except HTTPError as exc:
            response = exc
        with response:
            body = response.read()
            assert response.status == expected,(path,response.status,body[:500])
            return response.headers,body
    try:
        for attempt in range(40):
            try:
                assert fetch("/__desktop/health")[1] == b"local-test"
                break
            except OSError:
                time.sleep(.1)
        assert json.loads(fetch("/api/cloud.php?action=session")[1])["user"] is None
        assert b"Your adventure is saved on this PC" in fetch("/play/")[1]
        assert b"Your adventure is saved on this PC" in fetch("/play")[1]
        assert b"664afd188b772ef2" in fetch("/game/index.html")[1]
        assert b"framework.swf" in fetch("/base.php",data=b"room=MainStreet&island=Early")[1]
        assert b"quest1=" in fetch("/get_questions.php")[1]
        assert b"json=" in fetch("/photos/get_scene_photos.php?scene_id=carrotMainStreet")[1]
        assert b"json=" in fetch("/get_island_names.php")[1]
        assert b"prefix=" in fetch("/getPrefix.php")[1]
        fetch("/cloud/game-loader.js")
        asset = "/game/Shell.swf"
        headers,body = fetch(asset)
        assert hashlib.sha256(body).hexdigest() == "664afd188b772ef2f25ca49cd2264a0482a7d8d05e693beb79f415e14287d3c1"
        assert not fetch(asset,304,headers={"If-None-Match":headers["ETag"]})[1]
        audio = next(public.rglob("*.mp3"))
        audio_path="/"+audio.relative_to(public).as_posix()
        audio_headers,_=fetch(audio_path,method="HEAD")
        _,partial = fetch(audio_path,206,headers={"Range":"bytes=15-30","If-Range":audio_headers["ETag"]})
        assert partial == audio.read_bytes()[15:31]
        assert fetch(audio_path,headers={"Range":"bytes=15-30","If-Range":'"older"'})[1]==audio.read_bytes()
        loader="game/ShellLoader.swf"
        before,original=fetch("/"+loader)
        replaced=generation/"files"/loader
        replaced.write_bytes(original[::-1])
        os.utime(replaced,(public.joinpath(loader).stat().st_mtime,)*2)
        after,changed=fetch("/"+loader,headers={"If-None-Match":before["ETag"]})
        assert changed==original[::-1] and after["ETag"]!=before["ETag"]
        assert fetch("/game/update-test.xml")[1] == b"<updated/>"
        fetch("/game/test-deleted.xml",404)
        fetch("/AMFPHP/ClassLoader.php",404)
        fetch("/api/social.php",503)
        fetch("/__desktop/health",403,headers={"Host":"example.invalid"})
        fetch("/__desktop/health",403,headers={"Origin":"https://example.invalid"})
    finally:
        process.terminate()
        process.wait(5)
print("Passed routes, shell digest, guest session, game services, cache validation, media range, generation updates, origin checks.")
