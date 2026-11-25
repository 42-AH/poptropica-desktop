from pathlib import Path
import re
import shutil

out = Path(__file__).resolve().parents[2] / "work/assembled/offline"
public = out / "public"

def save(rel, content):
    target = out / "overlay" / rel
    target.parent.mkdir(parents=True,exist_ok=True)
    target.write_text(content,encoding="utf-8")

def original(rel):
    return (public / rel).read_text(encoding="utf-8")

def replace_once(text, old, new):
    assert text.count(old) == 1, old
    return text.replace(old,new)

page = original("play/index.html")
page = page.replace('  <script defer src="/cloud/analytics.js"></script>', '')
page = re.sub(r'<!--.*?-->', '', page, flags=re.S)
page = re.sub(r'<button data-panel="(account|friends|photos)">[^<]+</button>', '', page)
page = re.sub(r'<h3>Signed out after closing your browser</h3><p>.*?</p>', '', page)
page = page.replace("Guest progress stays in this browser. Sign in through Account Settings for an online copy. Keep a downloaded backup somewhere safe.","Your adventure is saved on this PC. Download a backup to move it to another device.")
page = page.replace("Cloud keeps your latest save. Earlier versions stay on this browser and are removed if its data is cleared.", "Earlier saves are stored on this PC.")
page = page.replace("Browser fullscreen","Fullscreen").replace("browser or your account","app").replace("this browser","this app")
save("play/index.html",page)

wrapper = original("cloud/play.mjs")
wrapper = re.sub(r"function openAccountPanel\(initialMode='login'\)\{.*?\n\}", """function openAccountPanel(){
  if(gameControlsAvailable())message('Accounts are available in Play online.',true);
}""",wrapper,count=1,flags=re.S)
wrapper = wrapper.replace("else if(event.data.panel==='friends')friendsPanel.open(event.data.username);","else if(event.data.panel==='friends')message('Open Play online to join your friends.',true);")
wrapper = wrapper.replace("else if(event.data.panel==='photos')photosPanel.open();","else if(event.data.panel==='photos')message('Open Play online to view account photos.',true);")
wrapper = wrapper.replace('Saved on this browser. Sign in for an online copy.','Progress saved on this PC.')
wrapper = wrapper.replace('Progress saved on this browser.','Progress saved on this PC.')
wrapper = wrapper.replace('Guest · this browser','Offline').replace('Exit browser fullscreen','Exit fullscreen').replace('Browser fullscreen','Fullscreen')
save("cloud/play.mjs",wrapper)

loader = original("cloud/game-loader.js")
loader = replace_once(loader, "online.accountId?parent.postMessage({type:'poptropica:save',manual:true},location.origin):window.webOpenPanel('register')","parent.postMessage({type:'poptropica:save',manual:true},location.origin)")
save("cloud/game-loader.js",loader)
shutil.copyfile(Path(__file__).with_name("router.php"),out/"router.php")
