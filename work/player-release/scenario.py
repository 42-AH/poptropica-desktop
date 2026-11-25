from pathlib import Path
import threading, subprocess, json, time, os, socket, urllib.request, uuid, hashlib
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
d=Path(__file__).resolve().parent; offline=d.parent/'offline'
qa=d/('scenario-'+uuid.uuid4().hex[:8]);qa.mkdir()
feed=d/'publish/desktop/player/v1'; requests=[]
class Server(BaseHTTPRequestHandler):
 def log_message(self,*args): pass
 def do_GET(self):
  requests.append(self.path)
  if self.path=='/api/desktop-assets.php':
   self.send_response(304);self.end_headers();return
  if self.path not in ['/desktop/player/v1/'+p.name for p in feed.iterdir()]:
   self.send_error(404);return
  body=(feed/self.path.rsplit('/',1)[-1]).read_bytes()
  self.send_response(200);self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
server=ThreadingHTTPServer(('127.0.0.1',19177),Server)
threading.Thread(target=server.serve_forever,daemon=True).start()
def launch(mode):
 for marker in ['finish','ready','error']:(qa/marker).unlink(missing_ok=True)
 with socket.socket() as so:
  so.bind(('127.0.0.1',0));port=so.getsockname()[1]
 env=dict(os.environ, POPTROPICA_DESKTOP_QA_ROOT=str(qa),WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=f'--remote-debugging-port={port} --disable-background-networking --host-resolver-rules="MAP * ~NOTFOUND, EXCLUDE 127.0.0.1"')
 app=subprocess.Popen([d/'UpgradeTest.exe',mode],env=env)
 try:
  timeout=time.monotonic()+45
  while time.monotonic()<timeout:
   if (qa/'error').exists():raise RuntimeError((qa/'error').read_text())
   if (qa/'ready').exists():break
   assert app.poll() is None,(mode,app.returncode,list(qa.iterdir()),requests)
   time.sleep(.1)
  assert (qa/'ready').is_file()
  pages=json.load(urllib.request.urlopen(f'http://127.0.0.1:{port}/json/list',timeout=3))
  page=next(t for t in pages if t['url'].startswith('http://127.0.0.1:18743/play/'))
  subprocess.run(['node',offline/'check-save.cjs',page['webSocketDebuggerUrl'],'import' if mode=='baseline' else 'check'],check=True,timeout=24)
  print((qa/'ready').read_text(),'single window, save verified',flush=True)
 finally:
  (qa/'finish').touch()
  try:app.wait(12)
  except subprocess.TimeoutExpired:app.kill()
 assert app.returncode==0
try:
 launch('baseline');assert requests==[],requests
 launch('enable');assert requests.count('/desktop/player/v1/latest.txt')==1 and sum(r.endswith('.bin') for r in requests)==1,requests
 launch('updated')
 assert (qa/'Profile/automatic-updates').read_text()=='on'
 assert not (qa/'PlayerReleases/v1/next.pack').exists()
 current=qa/'PlayerReleases/v1/current.pack';b=bytearray(current.read_bytes());b[-8]^=1;current.write_bytes(b)
 (qa/'Profile/automatic-updates').write_text('off')
 launch('fallback')
 print('Opt-out, opt-in, background download, signed next-launch activation, five saved records, and corrupted-version fallback passed.',flush=True)
finally:server.shutdown();server.server_close()
