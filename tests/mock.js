// 假的 Firebase compat SDK：讓測試不用連網路就能跑整個 app。
(()=>{
  const store={nogi:{},hinata:{},sakura:{},keyaki:{},aoba:{},members:{}};
  const subs={};
  const clone=v=>JSON.parse(JSON.stringify(v));
  function snapOf(g){
    const ids=Object.keys(store[g]||{});
    return {forEach(cb){ids.forEach(id=>cb({id,data:()=>clone(store[g][id])}));},
            size:ids.length, empty:!ids.length,
            docs:ids.map(id=>({id,data:()=>clone(store[g][id])}))};
  }
  function notify(g){(subs[g]||[]).forEach(cb=>{try{cb(snapOf(g));}catch(e){console.error(e);}});}
  const fs={
    enablePersistence(){return Promise.resolve();},
    batch(){
      const ops=[];
      return {set(ref,d){ops.push(()=>ref.set(d));return this;},
              update(ref,d){ops.push(()=>ref.update(d));return this;},
              delete(ref){ops.push(()=>ref.delete());return this;},
              commit(){ops.forEach(f=>f());return Promise.resolve();}};
    },
    collection(g){
      store[g]=store[g]||{};
      return {
        doc(id){
          id=String(id);
          return {id,
            get(){return Promise.resolve({id,exists:id in store[g],
                                          data:()=>store[g][id]?clone(store[g][id]):undefined});},
            set(d){store[g][id]=clone(d);notify(g);return Promise.resolve();},
            update(patch){
              if(!store[g][id])store[g][id]={};
              Object.assign(store[g][id],clone(patch));notify(g);return Promise.resolve();},
            delete(){delete store[g][id];notify(g);return Promise.resolve();}};
        },
        onSnapshot(cb){ (subs[g]=subs[g]||[]).push(cb); setTimeout(()=>cb(snapOf(g)),0);
                        return ()=>{subs[g]=subs[g].filter(f=>f!==cb);}; }
      };
    }
  };
  let authCb=null;
  const cfg=window.__MOCK_AUTH||{};
  const user=cfg.signedOut?null:{uid:cfg.uid||'cHr53MtDS0OgfHm7xC9E1CVtbpA2',
    displayName:cfg.name||'測試者',email:cfg.email||'test@example.com',photoURL:''};
  const signInUser={uid:cfg.uid||'cHr53MtDS0OgfHm7xC9E1CVtbpA2',displayName:cfg.name||'測試者',
                    email:cfg.email||'test@example.com',photoURL:''};
  const auth={
    currentUser:user,
    setPersistence(){return Promise.resolve();},
    onAuthStateChanged(cb){authCb=cb;setTimeout(()=>cb(auth.currentUser),0);return ()=>{};},
    signInWithPopup(){window.__signInCalls=(window.__signInCalls||0)+1;
      auth.currentUser=signInUser;if(authCb)authCb(signInUser);
      return Promise.resolve({user:signInUser});},
    signInWithRedirect(){return Promise.resolve();},
    signOut(){window.__signOutCalls=(window.__signOutCalls||0)+1;
      auth.currentUser=null;if(authCb)authCb(null);return Promise.resolve();}
  };
  const authFn=()=>auth;
  authFn.GoogleAuthProvider=function(){this.addScope=()=>{};this.setCustomParameters=()=>{};};
  authFn.Auth={Persistence:{LOCAL:'local',SESSION:'session',NONE:'none'}};
  window.firebase={initializeApp(){return {};},firestore:()=>fs,auth:authFn};
  window.__store=store;
  window.__signOut=()=>auth.signOut();
  window.__signIn=()=>auth.signInWithPopup();
})();
