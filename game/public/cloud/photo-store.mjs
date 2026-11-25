// Captures stay with the workspace that earned them; guest photos never upload automatically.
export const PHOTO_LIMITS={count:1000,bytes:24*1024*1024,image:400000};
export function mergePhotoRecords(existing,photos,owner){
 if(owner!=='guest'&&!/^user:[1-9][0-9]*$/.test(owner))throw Error('Invalid photo owner.');
 const records=new Map(existing.map(row=>[row.key,{...row}]));
 for(const photo of photos){
  if(!photo||! /^[a-zA-Z][a-zA-Z0-9]{0,39}$/.test(photo.island)||! /^[0-9]{1,6}$/.test(String(photo.id)))continue;
  const image=typeof photo.image==='string'&&photo.image.length<=PHOTO_LIMITS.image&&/^iVBORw0KGgo[A-Za-z0-9+/=]*$/.test(photo.image)?photo.image:'';
  const key=owner+'|'+photo.island+'|'+photo.id,old=records.get(key);
  if(old){if(!old.image&&image){old.image=image;old.pending=owner!=='guest';}}
  else records.set(key,{key,owner,island:photo.island,id:String(photo.id),image,pending:owner!=='guest'});
 }
 const result=[...records.values()];
 if(result.filter(row=>row.owner===owner).length>PHOTO_LIMITS.count||result.reduce((sum,row)=>sum+(row.image?.length||0)+256,0)>PHOTO_LIMITS.bytes)throw Error('This browser’s photo storage is full. Existing pictures are safe.');
 return result;
}
export function createPhotoStore(indexedDB=globalThis.indexedDB,databaseName='poptropica-photo-captures'){
 let connection;
 function open(){return connection??=new Promise((resolve,reject)=>{
  if(!indexedDB){reject(Error('This browser could not keep photo captures.'));return;}
  const request=indexedDB.open(databaseName,1);
  request.onupgradeneeded=()=>request.result.createObjectStore('photos',{keyPath:'key'});
  request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
 });}
 async function transact(mode,operation){
  const db=await open();return new Promise((resolve,reject)=>{
   const tx=db.transaction('photos',mode),store=tx.objectStore('photos');let value,error;
   tx.oncomplete=()=>resolve(value);tx.onerror=tx.onabort=()=>reject(error||tx.error||Error('Photo storage failed.'));
   const request=store.getAll();request.onsuccess=()=>{try{value=operation(store,request.result);}catch(caught){error=caught;tx.abort();}};
  });
 }
 return {
  list:owner=>transact('readonly',(_,rows)=>rows.filter(row=>row.owner===owner)),
  put:(owner,photos)=>transact('readwrite',(store,rows)=>{
   const merged=mergePhotoRecords(rows,photos,owner),previous=new Map(rows.map(row=>[row.key,row]));
   for(const row of merged){
    if(row.owner!==owner)continue;
    const old=previous.get(row.key);
    // Existing earned-photo IDs arrive repeatedly. Only new captures or a new
    // image change their record; avoid cloning/writing the whole album again.
    if(!old || old.image!==row.image || old.pending!==row.pending)store.put(row);
   }
  }),
  acknowledge:(owner,sent)=>transact('readwrite',(store,rows)=>{for(const photo of sent){const row=rows.find(row=>row.owner===owner&&row.island===photo.island&&row.id===photo.id);if(row&&row.pending&&row.image===(photo.image||''))store.put({...row,pending:false});}})
 };
}
export function photoUploadBatch(rows){
 const batch=[];let bytes=0;
 for(const row of rows){if(!row.pending)continue;const photo={island:row.island,id:row.id,...(row.image?{image:row.image}:{})};const size=JSON.stringify(photo).length+1;if(bytes+size>450000||batch.length===1000)break;batch.push(photo);bytes+=size;}
 return batch;
}
