// 分享預覽（Open Graph／Twitter Card）、favicon、robots.txt。
// 這些東西平常看不到，壞了也不會有人抱怨，所以更需要測。
const {launch,openPage,suite,BASE}=require('./lib');
const S=suite('分享預覽與網站中繼資料');

(async()=>{
  const b=await launch();
  const p=await openPage(b,{onError:S.onError});

  const M=await p.evaluate(()=>{
    const get=sel=>{const e=document.querySelector(sel);
      return e?(e.getAttribute('content')||e.getAttribute('href')||''):null;};
    const names=[...document.querySelectorAll('meta[property],meta[name]')]
      .map(e=>e.getAttribute('property')||e.getAttribute('name'));
    const dup=names.filter((n,i)=>names.indexOf(n)!==i);
    return {
      title:document.title,
      desc:get('meta[name="description"]'),
      canonical:get('link[rel="canonical"]'),
      icon:get('link[rel="icon"]'),
      apple:get('link[rel="apple-touch-icon"]'),
      ogType:get('meta[property="og:type"]'),
      ogSite:get('meta[property="og:site_name"]'),
      ogTitle:get('meta[property="og:title"]'),
      ogDesc:get('meta[property="og:description"]'),
      ogUrl:get('meta[property="og:url"]'),
      ogImg:get('meta[property="og:image"]'),
      ogW:get('meta[property="og:image:width"]'),
      ogH:get('meta[property="og:image:height"]'),
      ogAlt:get('meta[property="og:image:alt"]'),
      ogLocale:get('meta[property="og:locale"]'),
      twCard:get('meta[name="twitter:card"]'),
      twTitle:get('meta[name="twitter:title"]'),
      twDesc:get('meta[name="twitter:description"]'),
      twImg:get('meta[name="twitter:image"]'),
      dup
    };
  });

  // ── 基本中繼資料 ──
  S.chk('標題還在', M.title==='坂道系列 選拔名單', M.title);
  S.chk('有 description', !!M.desc&&M.desc.length>20, M.desc&&M.desc.length);
  S.chk('description 不會長到被截斷', M.desc&&M.desc.length<=160, M.desc&&M.desc.length);
  S.chk('description 提到四個團',
        ['乃木坂','日向坂','櫻坂','欅坂'].every(g=>(M.desc||'').includes(g)), M.desc);
  S.chk('有 canonical', !!M.canonical, M.canonical);
  S.chk('canonical 是絕對網址', /^https:\/\//.test(M.canonical||''), M.canonical);

  // ── favicon ──
  S.chk('有 icon', !!M.icon, M.icon);
  S.chk('有 apple-touch-icon', !!M.apple, M.apple);
  for(const [name,href] of [['icon',M.icon],['apple-touch-icon',M.apple]]){
    const ok=await p.evaluate(u=>fetch(u).then(r=>r.ok).catch(()=>false),href);
    S.chk(name+' 的檔案抓得到', ok, href);
  }
  S.chk('icon 用相對路徑（換網域不會壞）', !/^https?:/.test(M.icon||''), M.icon);

  // ── Open Graph ──
  S.chk('og:type 是 website', M.ogType==='website', M.ogType);
  S.chk('有 og:site_name', !!M.ogSite, M.ogSite);
  S.chk('og:title 與標題一致', M.ogTitle===M.title, M.ogTitle);
  S.chk('og:description 與 description 一致', M.ogDesc===M.desc);
  S.chk('og:url 是絕對網址', /^https:\/\//.test(M.ogUrl||''), M.ogUrl);
  S.chk('og:url 與 canonical 一致', M.ogUrl===M.canonical, M.ogUrl+' vs '+M.canonical);
  S.chk('og:image 是絕對網址（爬蟲不解相對路徑）',
        /^https:\/\/.+\.png$/.test(M.ogImg||''), M.ogImg);
  S.chk('有 og:image 尺寸', M.ogW==='1200'&&M.ogH==='630', M.ogW+'x'+M.ogH);
  S.chk('有 og:image:alt', !!M.ogAlt, M.ogAlt);
  S.chk('og:locale 是 zh_TW', M.ogLocale==='zh_TW', M.ogLocale);

  // ── Twitter Card ──
  S.chk('twitter:card 是大圖', M.twCard==='summary_large_image', M.twCard);
  S.chk('twitter:title 與 og:title 一致', M.twTitle===M.ogTitle);
  S.chk('twitter:description 與 og:description 一致', M.twDesc===M.ogDesc);
  S.chk('twitter:image 與 og:image 一致', M.twImg===M.ogImg, M.twImg);

  S.chk('沒有重複的 meta 標籤', M.dup.length===0, M.dup.join(','));

  // ── og.png 本身 ──
  const IMG=await p.evaluate(()=>new Promise(res=>{
    const i=new Image();
    i.onload=()=>res({ok:true,w:i.naturalWidth,h:i.naturalHeight});
    i.onerror=()=>res({ok:false});
    i.src='og.png';
  }));
  S.chk('og.png 存在且載得起來', IMG.ok);
  S.chk('og.png 尺寸就是宣告的 1200x630',
        IMG.w===1200&&IMG.h===630, IMG.w+'x'+IMG.h);
  S.chk('og.png 跟宣告的檔名對得上',
        (M.ogImg||'').endsWith('/og.png'), M.ogImg);

  // ── robots.txt ──
  const R=await p.evaluate(async base=>{
    try{const r=await fetch(base+'robots.txt');
        return {ok:r.ok,status:r.status,text:await r.text()};}
    catch(e){return {ok:false,status:0,text:String(e)};}
  },BASE);
  S.chk('robots.txt 拿得到（原本是 404）', R.ok, R.status);
  S.chk('robots.txt 有 User-agent', /User-agent:\s*\*/i.test(R.text), R.text.split('\n')[0]);
  S.chk('robots.txt 允許收錄首頁', /^Allow:\s*\/$/mi.test(R.text));
  S.chk('robots.txt 把測試目錄排除在搜尋結果外',
        /Disallow:\s*\/tests\//i.test(R.text));

  // 頁面本身沒被改壞
  S.chk('頁面照常運作', (await p.locator('#nogi-grid').count())>0);

  await b.close();
  const r=S.report();
  process.exit(r.fail||r.errors?1:0);
})();
