// PWA：manifest 用相對路徑，所以子目錄（GitHub Pages）與根目錄（自訂網域）
// 兩種部署都要能正確解析 start_url，不能 404。
const {launch,openPage,suite}=require('./lib');
const S=suite('PWA manifest 與 Service Worker');

async function check(b,base,label){
  const p=await openPage(b,{base,onError:S.onError});
  const M=await p.evaluate(async()=>{
    const link=document.querySelector('link[rel=manifest]');
    const url=new URL(link.getAttribute('href'),location.href).href;
    const res=await fetch(url);
    const m=await res.json();
    return {ok:res.ok,url,
      start:new URL(m.start_url,url).href,
      scope:m.scope?new URL(m.scope,url).href:null,
      icon:new URL(m.icons[0].src,url).href};
  });
  const dir=new URL('./',base).href;
  S.chk(label+'：manifest 載得到', M.ok, M.url);
  S.chk(label+'：start_url 指到站台根目錄', M.start===dir, M.start);
  S.chk(label+'：scope 指到站台根目錄', M.scope===dir, M.scope);
  S.chk(label+'：圖示路徑正確', M.icon===dir+'icon-192.png', M.icon);
  S.chk(label+'：圖示真的抓得到',
        await p.evaluate(u=>fetch(u).then(r=>r.ok).catch(()=>false),M.icon));
  S.chk(label+'：start_url 真的打得開（不是 404）',
        await p.evaluate(u=>fetch(u).then(r=>r.ok).catch(()=>false),M.start));
  const sw=await p.evaluate(()=>navigator.serviceWorker.ready
    .then(r=>({scope:r.scope,active:!!r.active})).catch(e=>({err:String(e)})));
  S.chk(label+'：Service Worker 註冊成功', sw.active===true, JSON.stringify(sw));
  S.chk(label+'：SW scope 跟 manifest 一致', sw.scope===dir, sw.scope);
  S.chk(label+'：卡片容器畫得出來', (await p.locator('#nogi-grid').count())>0);
  await p.close();
}

(async()=>{
  const b=await launch();
  await check(b,'http://127.0.0.1:8099/sakamichi/','子目錄（GitHub Pages）');
  await check(b,'http://127.0.0.1:8100/','根目錄（自訂網域）');
  await b.close();
  const r=S.report();
  process.exit(r.fail||r.errors?1:0);
})();
