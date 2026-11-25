export const FORMAT = 'poptropica-ruffle-save';
export const META_KEY = 'poptropica.cloud.workspace.v1';
export const MAX_BYTES = 4194304;
export function isSol(value) {
  if (typeof value !== 'string' || value.length > MAX_BYTES || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) return false;
  // Validate the complete base64 spelling, but decode only the header we inspect.
  // Padding/length checks preserve atob's rejection of malformed trailing bytes.
  const padding=value.endsWith('==')?2:value.endsWith('=')?1:0;
  const contentLength=value.length-padding;
  if(contentLength%4===1 || (padding>0 && value.length%4!==0) || Math.floor(contentLength*3/4)<16) return false;
  try { const raw=atob(value.slice(0,16)); return raw.charCodeAt(0)===0 && raw.charCodeAt(1)===191 && raw.slice(6,10)==='TCSO'; } catch { return false; }
}
export function validPath(path) { return typeof path==='string' && /^\/[A-Za-z0-9_./%:@ -]{1,511}$/.test(path) && !path.includes('..'); }
export function validateBundle(bundle) {
  if (!bundle || bundle.format!==FORMAT || bundle.version!==1 || !bundle.files || typeof bundle.files!=='object' || Array.isArray(bundle.files)) throw new Error('Choose a Poptropica save backup.');
  const entries=Object.entries(bundle.files);
  if(entries.length>256 || entries.some(([path,value])=>!validPath(path)||!isSol(value))) throw new Error('This backup contains invalid game save data.');
  return finishBundle(entries).bundle;
}
// Private: callers have already validated each entry. Keep serialization with
// this snapshot so preparing its hash does not validate/decode/sort it again.
function finishBundle(entries) {
  if(entries.length>256) throw new Error('This backup contains invalid game save data.');
  const bundle={format:FORMAT,version:1,files:Object.fromEntries(entries.sort(([a],[b])=>a<b?-1:a>b?1:0))};
  const text=JSON.stringify(bundle);
  if(text.length>MAX_BYTES) throw new Error('The backup is too large.');
  return {bundle,text};
}
export function snapshot(storage, hostname) { return captureSnapshot(storage,hostname).bundle; }
function captureSnapshot(storage, hostname) {
  const files={};
  for(let i=0;i<storage.length;i++) {
    const key=storage.key(i);
    if(!key?.startsWith(hostname+'/')) continue;
    const value=storage.getItem(key);
    if(isSol(value)) {
      const path=key.slice(hostname.length); if(validPath(path)) files[path]=value;
    }
  }
  return finishBundle(Object.entries(files));
}
// Caller must stop the player, hold the workspace lock and persist a backup first.
export function install(storage, hostname, input) {
  const bundle=validateBundle(input); const before=snapshot(storage,hostname);
  const keys=Object.keys(before.files);
  try {
    for(const path of keys) storage.removeItem(hostname+path);
    for(const [path,value] of Object.entries(bundle.files)) storage.setItem(hostname+path,value);
  } catch(error) {
    for(const path of Object.keys(bundle.files)) storage.removeItem(hostname+path);
    for(const [path,value] of Object.entries(before.files)) storage.setItem(hostname+path,value);
    throw error;
  }
}
export function canonical(bundle) { return JSON.stringify(validateBundle(bundle)); }
export async function fingerprint(bundle) { return fingerprintText(canonical(bundle)); }
async function fingerprintText(text) {
  const bytes=new TextEncoder().encode(text);
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
}
// Keep one immutable prepared bundle. A cache hit still reads every current
// save key/value, so additions, removals and byte changes invalidate it
// synchronously without relying on storage events.
export async function prepareSnapshot(storage,hostname,cached=null) {
  if(cached?.bundle?.files && typeof cached.digest==='string') {
    const files=cached.bundle.files,expected=Object.keys(files).length;
    let seen=0,match=true;
    for(let i=0;i<storage.length;i++) {
      const key=storage.key(i);
      if(!key?.startsWith(hostname+'/'))continue;
      const path=key.slice(hostname.length),value=storage.getItem(key);
      if(!validPath(path) || !Object.hasOwn(files,path) || files[path]!==value) {match=false;break;}
      seen++;
    }
    if(match&&seen===expected)return cached;
  }
  const {bundle,text}=captureSnapshot(storage,hostname),digest=await fingerprintText(text);
  Object.freeze(bundle.files);Object.freeze(bundle);
  return Object.freeze({bundle,digest});
}
export const emptyBundle=()=>({format:FORMAT,version:1,files:{}});

export function chooseStartup(local, remote, localDigest) {
  if(!local) return remote.bundle?'remote':'new';
  const dirty=localDigest!==local.syncedDigest;
  if(!dirty) return remote.bundle?'remote':'local';
  if(remote.digest===localDigest) return 'remote';
  if(remote.revision===local.revision) return 'local';
  return 'conflict';
}
export function openBackups(name='poptropica-cloud-backups') {
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open(name,2);
    request.onupgradeneeded=()=>{
      const db=request.result;
      if(!db.objectStoreNames.contains('snapshots'))db.createObjectStore('snapshots');
      if(!db.objectStoreNames.contains('history')) {
        const history=db.createObjectStore('history',{keyPath:'id',autoIncrement:true});
        history.createIndex('ownerDigest',['owner','digest'],{unique:true});
        history.createIndex('ownerId',['owner','id']);
      }
    };
    request.onblocked=()=>reject(new Error('Close other Poptropica tabs, then reload to update browser backups.'));
    request.onerror=()=>reject(request.error); request.onsuccess=()=>{request.result.onversionchange=()=>request.result.close();resolve(request.result);};
  });
}
export function backupGet(db,key) {
  return new Promise((resolve,reject)=>{const request=db.transaction('snapshots').objectStore('snapshots').get(key); request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
}
export function backupPut(db,key,value) {
  return new Promise((resolve,reject)=>{const tx=db.transaction('snapshots','readwrite');tx.objectStore('snapshots').put(value,key);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('Cannot store a local backup.'));});
}
