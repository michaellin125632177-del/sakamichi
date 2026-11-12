// 假的 Firebase compat SDK：讓測試不用連網路就能跑整個 app。
(()=>{
  const store={nogi:{},hinata:{},sakura:{},keyaki:{},aoba:{},members:{},
               polls:{},votes:{}};
  // FieldValue.increment / FieldPath 的最小替身，夠跑投票那條路徑
  const INC=Symbol('inc');
  function applyPatch(target,patch){
    Object.keys(patch).forEach(k=>{
      const v=patch[k];
      if(v&&v[INC]!==undefined){target[k]=(typeof target[k]==='number'?target[k]:0)+v[INC];}
      else if(v&&typeof v==='object'&&!Array.isArray(v)&&typeof target[k]==='object'
              &&target[k]&&!Array.isArray(target[k])){applyPatch(target[k],v);}
      else target[k]=clone(v);
    });
  }
  // update(ref, FieldPath, value, FieldPath, value, ...) → 巢狀物件
  function pathsToPatch(args){
    const patch={};
    for(let i=0;i<args.length;i+=2){
      const segs=args[i]&&args[i].__segs?args[i].__segs:String(args[i]).split('.');
      let cur=patch;
      segs.forEach((sg,j)=>{
        if(j===segs.length-1)cur[sg]=args[i+1];
        else cur=(cur[sg]=cur[sg]||{});
      });
    }
    return patch;
  }
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
              update(ref,...a){
                const patch=(a.length===1&&!(a[0]&&a[0].__segs))?a[0]:pathsToPatch(a);
                ops.push(()=>ref.update(patch));return this;},
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
            update(...a){
              if(!store[g][id])throw new Error('not-found: '+g+'/'+id);
              const patch=(a.length===1&&!(a[0]&&a[0].__segs))?a[0]:pathsToPatch(a);
              applyPatch(store[g][id],patch);notify(g);return Promise.resolve();},
            delete(){delete store[g][id];notify(g);return Promise.resolve();},
            onSnapshot(cb){
              const fire=()=>cb({exists:id in store[g],id,
                data:()=>store[g][id]?clone(store[g][id]):undefined});
              (subs[g]=subs[g]||[]).push(fire); setTimeout(fire,0);
              return ()=>{subs[g]=subs[g].filter(f=>f!==fire);};
            }};
        },
        onSnapshot(cb){ (subs[g]=subs[g]||[]).push(cb); setTimeout(()=>cb(snapOf(g)),0);
                        return ()=>{subs[g]=subs[g].filter(f=>f!==cb);}; },
        // 只支援 where(field,'==',value)，夠結算時撈某個預測的注單用
        where(field,op,val){
          const ids=Object.keys(store[g]).filter(id=>store[g][id][field]===val);
          return {get(){return Promise.resolve({
            forEach(cb){ids.forEach(id=>cb({id,data:()=>clone(store[g][id])}));},
            size:ids.length,empty:!ids.length});}};
        }
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
    createUserWithEmailAndPassword(email,pw){
      if(store.__users&&store.__users[email])
        return Promise.reject({code:'auth/email-already-in-use'});
      if(String(pw||'').length<6)return Promise.reject({code:'auth/weak-password'});
      store.__users=store.__users||{};
      const uid='u-'+Object.keys(store.__users).length+'-'+email.slice(1,7);
      store.__users[email]={pw,uid};
      const u={uid,email,isAnonymous:false,displayName:null,
        updateProfile(pr){this.displayName=pr.displayName;
          store.__users[email].name=pr.displayName;return Promise.resolve();}};
      auth.currentUser=u; if(authCb)authCb(u);
      return Promise.resolve({user:u});
    },
    signInWithEmailAndPassword(email,pw){
      const r=store.__users&&store.__users[email];
      if(!r||r.pw!==pw)return Promise.reject({code:'auth/invalid-credential'});
      const u={uid:r.uid,email,isAnonymous:false,displayName:r.name||null};
      auth.currentUser=u; if(authCb)authCb(u);
      return Promise.resolve({user:u});
    },
    signInAnonymously(){
      window.__anonCalls=(window.__anonCalls||0)+1;
      const u={uid:'anon-'+(cfg.anonUid||'1'),isAnonymous:true,displayName:null,email:null};
      auth.currentUser=u; if(authCb)authCb(u);
      return Promise.resolve({user:u});},
    signOut(){window.__signOutCalls=(window.__signOutCalls||0)+1;
      auth.currentUser=null;if(authCb)authCb(null);return Promise.resolve();}
  };
  const authFn=()=>auth;
  authFn.GoogleAuthProvider=function(){this.addScope=()=>{};this.setCustomParameters=()=>{};};
  authFn.Auth={Persistence:{LOCAL:'local',SESSION:'session',NONE:'none'}};
  const firestoreFn=()=>fs;
  firestoreFn.FieldValue={increment(n){return {[INC]:n};}};
  firestoreFn.FieldPath=function(...segs){this.__segs=segs;};
  window.firebase={initializeApp(){return {};},firestore:firestoreFn,auth:authFn};
  window.__store=store;
  window.__signOut=()=>auth.signOut();
  window.__signIn=()=>auth.signInWithPopup();
})();
