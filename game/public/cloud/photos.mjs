import {createPhotoStore,photoUploadBatch} from './photo-store.mjs';
// Private photo album. New captures and imported earned-photo IDs are additive.
export function createPhotosPanel({getUser,request,openAccount,notice,store=createPhotoStore()}){
 const dialog=document.createElement('dialog');dialog.className='photos-dialog';dialog.setAttribute('aria-labelledby','photos-title');
 const heading=document.createElement('h2');heading.id='photos-title';heading.textContent='Adventure photos';
 const intro=document.createElement('p');intro.textContent='Your adventure album. Older entries show island artwork when their original picture was not saved.';
 const status=document.createElement('p');status.setAttribute('role','status');
 const list=document.createElement('div');list.className='photo-list';
 const close=document.createElement('button');close.className='close';close.textContent='×';close.setAttribute('aria-label','Close photos');close.onclick=()=>dialog.close();
 const signIn=document.createElement('button');signIn.textContent='Sign in for online photos';signIn.onclick=()=>{dialog.close();openAccount();};signIn.hidden=true;
 dialog.append(heading,intro,status,list,signIn,close);(document.getElementById('game-view')||document.body).append(dialog);
 const ownerFor=account=>account==null?'guest':'user:'+account;
 const currentOwner=()=>ownerFor(getUser()?.id);
 let uploading=null;
 async function flush(owner){
  if(owner==='guest'||currentOwner()!==owner)return;
  const previous=uploading;
  const operation=(async()=>{
   if(previous){try{await previous;}catch{}}
   if(currentOwner()!==owner)return;
   // One bounded request per trigger respects the service's photo-write limit.
   const batch=photoUploadBatch(await store.list(owner));
   if(!batch.length||currentOwner()!==owner)return;
   await request('store',{photos:batch});
   await store.acknowledge(owner,batch);
  })();
  uploading=operation;
  try{await operation;}finally{if(uploading===operation)uploading=null;}
 }
 let generation=0;
 const friendly=value=>value.replace(/([a-z])([A-Z0-9])/g,'$1 $2').replace(/^./,c=>c.toUpperCase());
 async function open(){
  if(dialog.open)return;dialog.showModal();const token=++generation,account=getUser()?.id??null;list.replaceChildren();status.textContent='Loading photos…';signIn.hidden=account!==null;
  try{
   const owner=ownerFor(account);let warning='';
   try{await flush(owner);}catch{warning='Some pictures are waiting to upload. ';}
   let local=[];try{local=await store.list(owner);}catch{warning+='This browser’s photo storage is unavailable. ';}
   let result={photos:[]};
   if(account!==null){try{result=await request('list');}catch(error){if(!local.length)throw error;warning+='Showing pictures kept on this browser. ';}}
   const merged=new Map(local.map(photo=>[photo.island+':'+photo.id,{...photo,hasImage:!!photo.image}]));
   for(const photo of result.photos){const key=photo.island+':'+photo.id,stored=merged.get(key);merged.set(key,{...stored,...photo,hasImage:photo.hasImage||!!stored?.image,image:photo.hasImage?'':stored?.image});}
   result.photos=[...merged.values()];if(token!==generation||(getUser()?.id??null)!==account)return;
   let artwork={};try{const response=await fetch('/cloud/photo-scenes/catalog.json');if(response.ok)artwork=await response.json();}catch{}
   if(token!==generation||(getUser()?.id??null)!==account)return;
   status.textContent=warning+(result.photos.length?`${result.photos.length} ${result.photos.length===1?'photo':'photos'} collected`:'Photos appear here as you explore islands.');
   for(const photo of result.photos){
    const figure=document.createElement('figure'),caption=document.createElement('figcaption');
    const preview=artwork[photo.island+'-'+photo.scene]||artwork[photo.island+'-id-'+photo.id]||(photo.island==='legacy'?artwork['legacy-'+photo.id]:null);
    if(photo.hasImage||preview){
     const image=document.createElement('img');image.alt=photo.hasImage?'Your adventure photo':friendly(photo.island)+' island artwork';image.loading='lazy';
     image.src=photo.image?'data:image/png;base64,'+photo.image:photo.hasImage?'/api/photos.php?action=image&island='+encodeURIComponent(photo.island)+'&id='+encodeURIComponent(photo.id):preview;
     image.addEventListener('error',()=>{image.hidden=true;caption.textContent='This picture could not load. Your collected photo is still saved.';});
     figure.append(image);caption.textContent=photo.hasImage?'':'Island artwork';
    }else{caption.textContent='Collected photo — original picture unavailable';}
    figure.append(caption);list.append(figure);
   }
  }catch(error){if(token===generation)status.textContent=error.message;}
 }
 dialog.addEventListener('close',()=>{generation++;list.replaceChildren();status.textContent='';});
 return {open,close(){if(dialog.open)dialog.close();},reset(){if(dialog.open)dialog.close();},async record(photos){
  const account=getUser()?.id;
  if(!Array.isArray(photos)||photos.length>1000)return;
  const owner=ownerFor(account);
  try{await store.put(owner,photos);}catch(error){
   if(currentOwner()!==owner)return;
   notice((error.message||'This browser could not keep the picture.')+' Your earned-photo progress is still saved with your game.');
   if(account){try{await request('store',{photos});}catch{} }
   return;
  }
  if(!account)return;
  try{await flush(owner);}catch(error){
   if(getUser()?.id!==account)return;
   notice(error?.status===409?error.message+' Your pictures are kept on this browser.':'Photo upload could not finish. Your pictures are kept on this browser and will retry when you open Photos.');
  }
 }};
}
