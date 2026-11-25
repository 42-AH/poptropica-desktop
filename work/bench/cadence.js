(()=>{
 const doc=document.querySelector('iframe').contentWindow;
 const originals=[];
 let drawn=false,frames=0,presents=0,gaps=0,last=0;
 for(const api of [doc.WebGLRenderingContext,doc.WebGL2RenderingContext]){
  if(!api)continue;
  for(const name of ['drawElements','drawArrays','drawElementsInstanced','drawArraysInstanced']){
   const proto=api.prototype;
   if(!Object.hasOwn(proto,name))continue;
   const fn=proto[name];
   if(typeof fn!=='function')continue;
   originals.push([proto,name,fn]);proto[name]=function(...args){drawn=true;return fn.apply(this,args)};
  }
 }
 const start=doc.performance.now();
 function sample(t){
  if(last&&t-last>50)gaps++;last=t;
  frames++;if(drawn)presents++;drawn=false;
  if(t-start<5000){doc.requestAnimationFrame(sample);return;}
  for(const [proto,name,fn] of originals)proto[name]=fn;
  window.benchDrawn={visible:doc.document.visibilityState,refreshHz:Math.round(frames*1000/(t-start)),drawnHz:Math.round(presents*1000/(t-start)),gaps};
 }
 doc.requestAnimationFrame(sample);
})()
