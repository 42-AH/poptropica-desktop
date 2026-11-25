if(location.origin==='https://poptropica.love' && location.pathname==='/play/' && window===window.top) {
  const realFetch=window.fetch.bind(window);
  window.fetch=async (url,options={})=>{
    const address=new URL(url,location.href);
    if(!address.pathname.startsWith('/api/'))return realFetch(url,options);
    const reply=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
    const id=Number(localStorage.fixtureAccount||41);
    const action=address.searchParams.get('action');
    if(action==='session')return reply({csrf:'test',user:id?{id,username:'Island'+id}:null,gamePolicy:{}});
    const k='fixture-cloud-'+id;
    let state=JSON.parse(localStorage.getItem(k)||'null');
    const {fingerprint}=await import('/cloud/save-store.mjs');
    if(!state){
      const bundle={format:'poptropica-ruffle-save',version:1,files:{'/initial':'AL8AAAAAVENTTwAAAAAAAAAA'}};
      state={accountId:id,revision:7,digest:await fingerprint(bundle),bundle};
      localStorage.setItem(k,JSON.stringify(state));
    }
    if(action==='save' && options.method==='POST'){
      const body=JSON.parse(options.body);
      if(body.accountId!==id || body.baseRevision!==state.revision)return reply({conflict:true},409);
      state={accountId:id,revision:state.revision+1,digest:await fingerprint(body.bundle),bundle:body.bundle};
      localStorage.setItem(k,JSON.stringify(state));
    }
    if(action==='save')return reply(state);
    return reply({accountId:id,versions:[],friends:[]});
  };
}
