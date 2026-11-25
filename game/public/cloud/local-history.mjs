import {validateBundle,fingerprint,backupGet} from './save-store.mjs';

function storeVersion(db,owner,bundle,digest,savedAt,revision) {
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('history','readwrite'),store=tx.objectStore('history');
    let id;
    const find=store.index('ownerDigest').getKey([owner,digest]);
    find.onsuccess=()=>{
      if(find.result!==undefined)id=find.result;
      else {const request=store.add({owner,digest,bundle,savedAt,revision});request.onsuccess=()=>{id=request.result;};}
    };
    tx.oncomplete=()=>resolve({id,digest});
    tx.onerror=()=>reject(tx.error||new Error('Cannot store earlier saves on this browser.'));
    tx.onabort=()=>reject(tx.error||new Error('Cannot store earlier saves on this browser.'));
  });
}

// Keep every distinct captured save; identical autosave/checkpoint calls share
// one record. Never evict older versions to make space silently.
export async function archiveVersion(db,owner,bundle,{savedAt=new Date().toISOString(),revision=null,expectedDigest=null}={}) {
  const clean=validateBundle(bundle),digest=await fingerprint(clean);
  if(expectedDigest&&digest!==expectedDigest)throw new Error('The earlier save failed verification. Its cloud copy was kept.');
  return storeVersion(db,owner,clean,digest,savedAt,revision);
}

// Used only for a bundle and digest captured together by the active player.
// Avoid validating and hashing the same immutable autosave again.
export function archivePreparedVersion(db,owner,{bundle,digest},{savedAt=new Date().toISOString(),revision=null}={}) {
  if(!bundle || typeof digest!=='string' || !/^[a-f0-9]{64}$/.test(digest))throw new TypeError('Invalid prepared save');
  return storeVersion(db,owner,bundle,digest,savedAt,revision);
}
export function historyPage(db,owner,before=Number.MAX_SAFE_INTEGER,limit=50) {
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('history'),rows=[];
    const request=tx.objectStore('history').index('ownerId').openCursor(IDBKeyRange.bound([owner,0],[owner,before],false,true),'prev');
    request.onsuccess=()=>{
      const cursor=request.result;
      if(!cursor||rows.length>=limit){resolve(rows);return;}
      const {id,savedAt,revision}=cursor.value;rows.push({id,savedAt,revision});cursor.continue();
    };
    request.onerror=()=>reject(request.error);
  });
}
export function historyVersion(db,owner,id) {
  return new Promise((resolve,reject)=>{
    const request=db.transaction('history').objectStore('history').get(id);
    request.onsuccess=()=>resolve(request.result?.owner===owner?request.result:null);
    request.onerror=()=>reject(request.error);
  });
}
export async function migrateBrowserBackups(db,owner) {
  for(const prefix of ['owner:','conflict:online:','conflict:device:','before-import:','before-restore:']) {
    const record=await backupGet(db,prefix+owner);
    if(record?.bundle)await archiveVersion(db,owner,record.bundle,{savedAt:record.savedAt,revision:record.revision});
  }
}
export async function transferCloudHistory(db,accountId,api,isCurrent) {
  if(!isCurrent())return;
  const list=await api('history');
  if(list.accountId!==accountId||!isCurrent())return;
  const committed=[];
  for(const row of list.versions) {
    if(!isCurrent())return;
    const record=await api('version',{query:'&revision='+encodeURIComponent(row.revision)});
    if(record.accountId!==accountId||record.revision!==Number(row.revision)||!isCurrent())return;
    // Await the IndexedDB transaction's commit before acknowledging deletion.
    await archiveVersion(db,'user:'+accountId,record.bundle,{savedAt:record.createdAt,revision:record.revision,expectedDigest:record.digest});
    committed.push({revision:record.revision,digest:record.digest});
  }
  if(committed.length&&isCurrent())await api('history-transferred',{data:{accountId,versions:committed}});
}
