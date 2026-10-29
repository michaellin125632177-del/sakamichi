// _headers：快取策略與安全標頭。
//
// ※ 測試伺服器用的是 tests/headers.js 的近似實作，不是 Cloudflare 本人。
//   所以這裡驗的是「規則寫對了、涵蓋到該涵蓋的路徑」，
//   上線後仍要對實際網站 curl 一次確認（README 有寫指令）。
const {launch,openPage,suite,BASE}=require('./lib');
const {load}=require('./headers');
const path=require('path');
const S=suite('_headers 快取與安全標頭');

(async()=>{
  const H=load(path.join(__dirname,'..','_headers'));
  S.chk('_headers 解析得過，而且有規則', H.rules.length>0, H.rules.length);

  // ── 檔案本身 ──
  const paths=H.rules.map(r=>r.path);
  S.chk('每條路徑都以 / 開頭', paths.every(p=>p.startsWith('/')), paths.join(' '));
  S.chk('有一條全站規則', paths.includes('/*'), paths.join(' '));
  const dup=paths.filter((p,i)=>paths.indexOf(p)!==i);
  S.chk('沒有重複的路徑', dup.length===0, dup.join(','));
  S.chk('標頭值都不是空的',
        H.rules.every(r=>r.headers.every(([,v])=>v.trim().length>0)));

  const all=H.headersFor('/index.html');

  // ── 安全標頭：每個路徑都要有 ──
  const SEC=['X-Content-Type-Options','Referrer-Policy','X-Frame-Options',
             'Permissions-Policy','Strict-Transport-Security'];
  ['/','/index.html','/sw.js','/og.png','/robots.txt','/manifest.json','/隨便一個不存在的路徑']
    .forEach(p=>{
      const h=H.headersFor(p);
      S.chk('『'+p+'』帶齊安全標頭', SEC.every(k=>h[k]), SEC.filter(k=>!h[k]).join(','));
    });
  S.chk('nosniff 設定正確', all['X-Content-Type-Options']==='nosniff',
        all['X-Content-Type-Options']);
  S.chk('Referrer-Policy 不外洩完整網址',
        /strict-origin/.test(all['Referrer-Policy']||''), all['Referrer-Policy']);
  S.chk('擋得住被嵌進別人的 iframe',
        /SAMEORIGIN|DENY/.test(all['X-Frame-Options']||''), all['X-Frame-Options']);
  S.chk('關掉用不到的裝置權限',
        ['camera','microphone','geolocation'].every(k=>
          (all['Permissions-Policy']||'').includes(k+'=()')), all['Permissions-Policy']);
  S.chk('HSTS 至少一年',
        /max-age=(\d+)/.test(all['Strict-Transport-Security']||'')&&
        +RegExp.$1>=31536000, all['Strict-Transport-Security']);

  // ── CSP ──
  const csp=all['Content-Security-Policy-Report-Only'];
  S.chk('CSP 先走 Report-Only（不會擋掉任何東西）', !!csp);
  S.chk('還沒啟用會攔截的 CSP', !all['Content-Security-Policy']);
  if(csp){
    [['default-src',"'self'"],
     ['script-src','https://www.gstatic.com'],      // Firebase SDK
     ['script-src','https://static.cloudflareinsights.com'], // 流量統計
     ['connect-src','https://*.googleapis.com'],    // Firestore
     ['frame-src','https://*.firebaseapp.com'],     // 登入用的隱藏 iframe
     ['frame-src','https://accounts.google.com'],   // Google 登入
     ['object-src',"'none'"],
     ['base-uri',"'self'"]].forEach(([d,v])=>{
      const seg=(csp.split(';').find(x=>x.trim().startsWith(d))||'');
      S.chk('CSP 的 '+d+' 含 '+v, seg.includes(v), seg.trim()||'（沒有這個指令）');
    });
    S.chk('CSP 允許頁面內嵌的 script 與 style（整個 app 都寫在裡面）',
          csp.includes("'unsafe-inline'"));
  }

  // ── 快取策略 ──
  const cc=p=>H.headersFor(p)['Cache-Control']||'';
  S.chk('Service Worker 不可被快取', /no-cache|no-store|max-age=0/.test(cc('/sw.js')), cc('/sw.js'));
  S.chk('首頁每次都回頭確認新版', /must-revalidate|no-cache/.test(cc('/')), cc('/'));
  S.chk('/index.html 與 / 一致', cc('/index.html')===cc('/'), cc('/index.html'));
  S.chk('manifest 也要能馬上生效',
        /must-revalidate|no-cache|max-age=0/.test(cc('/manifest.json')), cc('/manifest.json'));
  ['/icon-192.png','/icon-512.png','/og.png'].forEach(p=>{
    const m=/max-age=(\d+)/.exec(cc(p));
    S.chk('『'+p+'』有設快取', !!m, cc(p));
    S.chk('『'+p+'』沒有長到換圖會卡住', m&&+m[1]<=604800, m&&m[1]);
  });
  S.chk('圖片的快取比頁面長',
        /max-age=(\d+)/.test(cc('/og.png'))&&+RegExp.$1>0&&/max-age=0/.test(cc('/')));

  // ── 實際的 HTTP 回應 ──
  const b=await launch();
  const p=await openPage(b,{onError:S.onError});
  const R=await p.evaluate(async base=>{
    const out={};
    for(const u of ['index.html','sw.js','og.png','robots.txt','manifest.json']){
      try{const r=await fetch(base+u);
          out[u]={status:r.status,
            cc:r.headers.get('cache-control'),
            nosniff:r.headers.get('x-content-type-options'),
            frame:r.headers.get('x-frame-options'),
            csp:!!r.headers.get('content-security-policy-report-only')};}
      catch(e){out[u]={err:String(e)};}
    }
    try{const r=await fetch(base+'_headers'); out._headers={status:r.status};}
    catch(e){out._headers={err:String(e)};}
    return out;
  },BASE);
  ['index.html','sw.js','og.png','robots.txt','manifest.json'].forEach(u=>{
    S.chk('實際回應『'+u+'』帶 nosniff', R[u].nosniff==='nosniff', JSON.stringify(R[u]));
  });
  S.chk('實際回應的 sw.js 不可快取', /no-cache/.test(R['sw.js'].cc||''), R['sw.js'].cc);
  S.chk('實際回應的 index.html 會重新驗證',
        /must-revalidate/.test(R['index.html'].cc||''), R['index.html'].cc);
  S.chk('實際回應的 og.png 有快取',
        /max-age=86400/.test(R['og.png'].cc||''), R['og.png'].cc);
  S.chk('實際回應帶 CSP Report-Only', R['index.html'].csp);
  S.chk('_headers 本身不會被當成檔案發佈出去', R._headers.status===404, R._headers.status);
  S.chk('頁面照常運作', (await p.locator('#nogi-grid').count())>0);

  await b.close();
  const r=S.report();
  process.exit(r.fail||r.errors?1:0);
})();
