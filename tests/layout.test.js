// 版面：頁面本身不該橫向捲動，會超寬的只有站位圖，而且它自己捲。
const {launch,openPage,seed,suite}=require('./lib');
const S=suite('版面與橫向捲動');

const SIZES=[[360,780,'小手機'],[390,844,'手機'],[430,932,'大手機'],
             [768,1024,'平板'],[1024,768,'小筆電'],[1440,900,'桌機']];

(async()=>{
  const b=await launch();

  for(const [w,h,tag] of SIZES){
    const p=await openPage(b,{viewport:{width:w,height:h},onError:S.onError});
    await seed(p);
    const R=await p.evaluate(()=>({
      doc:document.documentElement.scrollWidth,
      win:window.innerWidth,
      body:Math.ceil(document.body.getBoundingClientRect().width),
      cols:getComputedStyle(document.querySelector('#nogi-grid'))
             .gridTemplateColumns.split(' ').length,
      // 卡片不可以比視窗寬
      widest:Math.max(...[...document.querySelectorAll('#nogi-grid .card')]
             .map(c=>Math.ceil(c.getBoundingClientRect().width)))
    }));
    S.chk(tag+' '+w+'px：頁面不橫向捲動', R.doc<=R.win+1, R.doc+' > '+R.win);
    S.chk(tag+' '+w+'px：body 不超出視窗', R.body<=R.win+1, R.body+' > '+R.win);
    S.chk(tag+' '+w+'px：卡片不超出視窗', R.widest<=R.win+1, R.widest+' > '+R.win);
    S.chk(tag+' '+w+'px：'+(w>=720?'兩欄':'單欄'), R.cols===(w>=720?2:1), R.cols+' 欄');
    await p.close();
  }

  // ── 站位圖自己捲 ──
  const p=await openPage(b,{viewport:{width:390,height:844},onError:S.onError});
  await seed(p);
  await p.waitForTimeout(700);
  const F=await p.evaluate(()=>{
    const fm=document.querySelector('#nogi-grid .card .fm');
    const st=getComputedStyle(fm);
    const tagIn=t=>{const a=t.getBoundingClientRect(),r=fm.getBoundingClientRect();
      return a.left>=r.left-1&&a.right<=r.right+1;};
    const center=[...fm.querySelectorAll('.tag')].find(t=>t.textContent.includes('★'));
    return {overflowX:st.overflowX,
      scrollable:fm.scrollWidth>fm.clientWidth,
      scrollLeft:Math.round(fm.scrollLeft),
      mid:Math.round((fm.scrollWidth-fm.clientWidth)/2),
      centerVisible:center?tagIn(center):'找不到 Center'};
  });
  S.chk('站位圖的 overflow-x 是 auto', F.overflowX==='auto', F.overflowX);
  S.chk('手機上站位圖確實超寬（所以需要自己捲）', F.scrollable);
  S.chk('一開始就捲到中間', Math.abs(F.scrollLeft-F.mid)<=2, F.scrollLeft+' vs '+F.mid);
  S.chk('Center 一進來就看得到（不必先橫滑）', F.centerVisible===true, F.centerVisible);

  // ── 排別標籤要釘住 ──
  const L=await p.evaluate(()=>{
    const fm=document.querySelector('#nogi-grid .card .fm');
    fm.scrollLeft=fm.scrollWidth;              // 捲到最右邊
    const lbl=fm.querySelector('.fm-lbl');
    const r=fm.getBoundingClientRect(), a=lbl.getBoundingClientRect();
    const st=getComputedStyle(lbl);
    return {position:st.position,
      bg:st.backgroundColor,
      opacity:st.opacity,
      stillVisible:a.left>=r.left-1&&a.right<=r.right+1,
      text:lbl.textContent};
  });
  S.chk('排別標籤是 sticky', L.position==='sticky', L.position);
  S.chk('捲到最右邊時標籤還在畫面內', L.stillVisible, L.text);
  S.chk('標籤有不透明背景（擋得住滑過去的成員）',
        L.bg!=='rgba(0, 0, 0, 0)'&&!/rgba\(.*,\s*0(\.\d+)?\)$/.test(L.bg), L.bg);
  // 回歸：opacity 會連背景一起透掉，sticky 就擋不住底下的標籤了
  S.chk('標籤沒有用 opacity 調淡', L.opacity==='1', L.opacity);

  // ── 頂部列不把頁面撐寬 ──
  const T=await p.evaluate(()=>{
    const r={};
    ['.tab-wrap','.top-btns'].forEach(sel=>{
      const e=document.querySelector(sel);
      r[sel]={overflowX:getComputedStyle(e).overflowX,
              scrollable:e.scrollWidth>e.clientWidth,
              within:Math.ceil(e.getBoundingClientRect().width)<=window.innerWidth+1};
    });
    return r;
  });
  ['.tab-wrap','.top-btns'].forEach(sel=>{
    S.chk(sel+' 自己捲，不撐寬頁面', T[sel].overflowX==='auto', T[sel].overflowX);
    S.chk(sel+' 寬度不超出視窗', T[sel].within, JSON.stringify(T[sel]));
  });

  S.chk('頁面照常運作', (await p.locator('#nogi-grid .card').count())>0);

  // ── 手機版的可點性與可讀性 ──
  // 把面板都打開，連同裡面的控制項一起量。
  await p.evaluate(()=>openMemberPanel('nogi','岩本蓮加'));
  await p.waitForTimeout(600);
  await p.click('button[onclick="toggleRankPanel()"]');
  await p.waitForTimeout(600);

  const UX=await p.evaluate(()=>{
    const key=e=>{const c=[...e.classList].filter(x=>!/active|is-|open/.test(x));
      return e.tagName.toLowerCase()+(c.length?'.'+c.join('.'):(e.id?'#'+e.id:''));};
    const taps=[...document.querySelectorAll('button,select,a[href],input')]
      .filter(e=>e.offsetParent&&e.getBoundingClientRect().height>0)
      .map(e=>({k:key(e),h:e.getBoundingClientRect().height}));
    const texts=[...document.querySelectorAll('*')]
      .filter(e=>e.offsetParent&&e.children.length===0&&e.textContent.trim())
      .map(e=>({k:key(e),fs:parseFloat(getComputedStyle(e).fontSize)}));
    const h=sel=>{const e=document.querySelector(sel);
      return e?Math.round(e.getBoundingClientRect().height):null;};
    return {
      minTap:Math.min(...taps.map(t=>t.h)),
      worstTap:taps.sort((a,b)=>a.h-b.h)[0],
      under32:taps.filter(t=>t.h<32).map(t=>t.k),
      minFont:Math.min(...texts.map(t=>t.fs)),
      worstFont:texts.sort((a,b)=>a.fs-b.fs)[0],
      under11:[...new Set(texts.filter(t=>t.fs<11).map(t=>t.k))],
      share:h('.card-share'), edit:h('.card-edit-btn'),
      pg:h('.pg-btn'), rank:h('#rs-ten'), pick:h('.fm-pick'),
      tagFs:parseFloat(getComputedStyle(document.querySelector('.fm .tag')).fontSize)
    };
  });
  S.chk('手機上沒有小於 32px 的可點元素',
        UX.under32.length===0, UX.under32.join(',')||('最小 '+Math.round(UX.minTap)+'px'));
  S.chk('最小的可點元素是哪個', UX.minTap>=32,
        UX.worstTap.k+' '+Math.round(UX.worstTap.h)+'px');
  [['分享鈕',UX.share],['編輯鈕',UX.edit],['換頁鈕',UX.pg],['排行榜切換',UX.rank]]
    .forEach(([n,v])=>S.chk('手機上『'+n+'』至少 36px', v>=36, v+'px'));
  S.chk('手機上『選拔／Under 下拉』至少 34px（原本只有 19px）', UX.pick>=34, UX.pick+'px');
  S.chk('手機上沒有小於 11px 的字',
        UX.under11.length===0, UX.under11.join(',')||('最小 '+UX.minFont.toFixed(1)+'px'));
  S.chk('最小的字是哪個', UX.minFont>=11,
        UX.worstFont.k+' '+UX.worstFont.fs.toFixed(1)+'px');
  S.chk('手機上成員標籤至少 12px（全站最常讀的字）', UX.tagFs>=12, UX.tagFs+'px');
  await p.close();

  // 桌機維持原本的密度，不受手機版放大影響
  const d=await openPage(b,{viewport:{width:1440,height:900},onError:S.onError});
  await seed(d);
  const D=await d.evaluate(()=>({
    tag:parseFloat(getComputedStyle(document.querySelector('.fm .tag')).fontSize),
    share:Math.round(document.querySelector('.card-share').getBoundingClientRect().height)
  }));
  S.chk('桌機的成員標籤沒有被一起放大', D.tag<UX.tagFs, D.tag+' < '+UX.tagFs);
  S.chk('桌機的分享鈕維持原本高度', D.share<36, D.share+'px');
  await d.close();

  await b.close();
  const r=S.report();
  process.exit(r.fail||r.errors?1:0);
})();
