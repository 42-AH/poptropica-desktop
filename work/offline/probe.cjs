const ws = new WebSocket(process.argv[2]);
const expression = `(() => {
    const frame = document.querySelector('iframe')?.contentWindow;
    const player = frame?.document.querySelector('ruffle-player,ruffle-embed,ruffle-object');
    const files = frame?.performance.getEntriesByType('resource') || [];
    return {ready: player?.readyState, playing: player?.isPlaying, shell: files.some(f => f.name.includes('Shell.swf'))};
})()`;
const timer = setTimeout(() => process.exit(1), 4500);
ws.onopen = () => ws.send(JSON.stringify({id:1, method:'Runtime.evaluate', params:{expression,returnByValue:true}}));
ws.onmessage = e => {
    const value = JSON.parse(e.data)?.result?.result?.value;
    if (!value) return;
    clearTimeout(timer);
    ws.close();
    if (!value.shell || !value.ready) process.exit(1);
    const fs = require('node:fs');
    const path = require('node:path');
    fs.writeFileSync(path.join(__dirname,'game-ready.json'),JSON.stringify(value));
    if (fs.existsSync(path.join(__dirname,'hold-test'))) process.exit(1);
    console.log(JSON.stringify(value));
};
ws.onerror = () => process.exit(1);
