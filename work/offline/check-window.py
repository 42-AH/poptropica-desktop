from pathlib import Path
import argparse
import ctypes
from ctypes import wintypes
import json
import os
import socket
import shutil
import subprocess
import time
import urllib.request
import uuid

work = Path(__file__).resolve().parent
parser = argparse.ArgumentParser()
parser.add_argument("--exe",type=Path,default=work.parents[1]/"outputs/Poptropica.exe")
parser.add_argument("--interrupt-once",action="store_true")
parser.add_argument("--resume",type=Path)
parser.add_argument("--guest-save",action="store_true")
args = parser.parse_args()
exe = args.exe.resolve()
qa = args.resume.resolve() if args.resume else work / ("q"+uuid.uuid4().hex[:5])
assert qa.is_relative_to(work)
qa.mkdir(exist_ok=bool(args.resume))
if list(exe.parent.glob("Microsoft.Web.WebView2.*.dll")):
    clean=qa/"Standalone"
    clean.mkdir(exist_ok=bool(args.resume))
    if not (clean/exe.name).exists(): shutil.copy2(exe,clean/exe.name)
    exe=clean/exe.name
ui = ctypes.windll.user32
visitor = ctypes.WINFUNCTYPE(wintypes.BOOL,wintypes.HWND,wintypes.LPARAM)
ui.SendMessageTimeoutW.argtypes = [wintypes.HWND,wintypes.UINT,wintypes.WPARAM,wintypes.LPARAM,wintypes.UINT,wintypes.UINT,ctypes.POINTER(ctypes.c_size_t)]
def send(hwnd,message,wparam=0,lparam=0):
    result = ctypes.c_size_t()
    ui.SendMessageTimeoutW(hwnd,message,wparam,lparam,2,500,ctypes.byref(result))
    return result.value

def windows(pid, parent=None):
    result = []
    @visitor
    def collect(hwnd,arg):
        process = wintypes.DWORD()
        ui.GetWindowThreadProcessId(hwnd,ctypes.byref(process))
        if process.value == pid and ui.IsWindowVisible(hwnd):
            result.append(hwnd)
        return True
    if parent is None:
        ui.EnumWindows(collect,0)
    else:
        ui.EnumChildWindows(parent,collect,0)
    return result

def label(hwnd):
    buffer = ctypes.create_unicode_buffer(400)
    send(hwnd,0x000d,len(buffer),ctypes.addressof(buffer))
    return buffer.value

with socket.socket() as sock:
    sock.bind(("127.0.0.1",0))
    port = sock.getsockname()[1]
env = dict(os.environ,POPTROPICA_DESKTOP_QA_ROOT=str(qa),WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=f"--remote-debugging-port={port}")
app = subprocess.Popen([exe,"--offline"],env=env)
if args.interrupt_once:
    deadline = time.monotonic()+60
    canceled=False
    while time.monotonic()<deadline and not canceled:
        for hwnd in windows(app.pid):
            controls={label(child):child for child in windows(app.pid,hwnd)}
            if "Unpacking the islands" in controls and "Cancel" in controls:
                send(controls["Cancel"],0xf5)
                canceled=True
                break
        time.sleep(.08)
    if not canceled:
        app.kill()
        raise AssertionError("Cancellation control did not appear")
    assert app.wait(40)==1
    assert not list((qa/"Versions").glob(".unpack-*"))
    print("Canceled extraction left no partial install",flush=True)
    app=subprocess.Popen([exe,"--offline"],env=env)
    deadline = time.monotonic()+60
    while time.monotonic() < deadline:
        if list((qa/"Versions").glob(".unpack-*/files/Microsoft.Web.WebView2.Core.dll")):
            break
        time.sleep(.05)
    else:
        app.kill()
        raise AssertionError("The first extraction did not start")
    app.kill()
    app.wait(10)
    print("Interrupted first extraction; relaunching",flush=True)
    app = subprocess.Popen([exe,"--offline"],env=env)
host = None
progress = False
prompt = bool(args.resume)
try:
    deadline = time.monotonic()+480
    while time.monotonic() < deadline:
        assert app.poll() is None,"Application exited"
        visible = windows(app.pid)
        assert len(visible) <= 1,("Extra window",visible)
        if not visible:
            time.sleep(.12)
            continue
        if host is None:
            host = visible[0]
        assert visible == [host],("Main window was replaced",host,visible)
        controls = {label(handle): handle for handle in windows(app.pid,host)}
        if args.resume:
            assert "No thanks" not in controls and "Unpacking the islands" not in controls
        if "Unpacking the islands" in controls or "Checking game files" in controls:
            if not progress: print("First run",hex(host),"shows unpacking",flush=True)
            progress = True
        if not prompt and "No thanks" in controls:
            assert progress
            print("Update preference in",hex(host),flush=True)
            send(controls["No thanks"],0xf5)
            prompt = True
        if prompt:
            try:
                targets = json.load(urllib.request.urlopen(f"http://127.0.0.1:{port}/json/list",timeout=.5))
            except OSError:
                targets = []
            pages = [t for t in targets if t["url"].startswith("http://127.0.0.1:18743/play/")]
            if pages:
                probe = subprocess.run(["node",work/"probe.cjs",pages[0]["webSocketDebuggerUrl"]],capture_output=True,text=True,timeout=8)
                if probe.returncode == 0:
                    print("Ruffle gameplay in",hex(host),probe.stdout.strip(),flush=True)
                    assert windows(app.pid) == [host]
                    if args.guest_save:
                        subprocess.run(["node",work/"check-save.cjs",pages[0]["webSocketDebuggerUrl"],"check" if args.resume else "import"],check=True,timeout=24)
                    break
        if not prompt and "Close" in controls: raise RuntimeError(list(controls))
        time.sleep(.25)
    else:
        raise RuntimeError(("Timed out",progress,prompt,list(controls)))
finally:
    if host: ui.PostMessageW(host,0x10,0,0)
    try: app.wait(12)
    except subprocess.TimeoutExpired: app.kill()
print("Verified single-window startup",qa)
assert not list((qa/"Versions").glob(".unpack-*"))
