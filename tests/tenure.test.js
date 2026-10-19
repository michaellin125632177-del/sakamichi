// 在籍天數排行榜：跨團重複的人要取區間聯集，不能把各團天數相加。
//
// ※ 現役成員的天數每天都在長，所以只對「已畢業」的人寫死數字，
//   現役的一律改成驗推導關係，否則這個檔過了今天就會開始紅。
const {launch,openPage,seed,suite}=require('./lib');
const S=suite('在籍天數排行榜');

(async()=>{
  const b=await launch();
  const p=await openPage(b,{viewport:{width:1100,height:1000},onError:S.onError});
  const fired=[]; await p.exposeFunction('__pwned',w=>fired.push(w));
  await p.reload({waitUntil:'domcontentloaded'}); await p.waitForTimeout(1500);
  await seed(p);

  // ── 區間聯集 ──
  const M=await p.evaluate(()=>({
    disjoint:mergeSpans([[0,10],[20,30]]).length,
    touching:mergeSpans([[0,10],[10,30]]),
    overlap:mergeSpans([[0,20],[10,30]]),
    contained:mergeSpans([[0,100],[20,30]]),
    unsorted:mergeSpans([[50,60],[0,10],[5,20]]),
    noMutate:(()=>{const a=[[5,9],[0,3]];mergeSpans(a);return a[0][0];})(),
    empty:mergeSpans([]).length
  }));
  S.chk('不相交的區間各自保留', M.disjoint===2, M.disjoint);
  S.chk('相接的區間併成一段', M.touching.length===1&&M.touching[0][1]===30, JSON.stringify(M.touching));
  S.chk('重疊的區間併成一段', M.overlap.length===1&&M.overlap[0][1]===30, JSON.stringify(M.overlap));
  S.chk('被包住的區間不另外計算', M.contained.length===1&&M.contained[0][1]===100, JSON.stringify(M.contained));
  S.chk('沒排序也算得對', M.unsorted.length===2&&M.unsorted[0][1]===20, JSON.stringify(M.unsorted));
  S.chk('不會改到傳進去的陣列', M.noMutate===5, M.noMutate);
  S.chk('空陣列不會爆', M.empty===0, M.empty);

  // ── 跨團不重複計算（這幾位都已畢業，數字固定）──
  const T=await p.evaluate(()=>{
    const t=tenureMap();
    const f=n=>t[n]?{days:t[n].days,years:t[n].years,active:t[n].active,
                     spans:t[n].spans.length,main:t[n].mainGroup,
                     sum:Math.round(Object.values(t[n].byGroup)
                          .reduce((a,x)=>a+x,0)/86400000)}:null;
    return {n:Object.keys(t).length,
      moriya:f('守屋茜'), tamura:f('田村保乃'), neru:f('長濱ねる'),
      asuka:f('齋藤飛鳥'), manatsu:f('秋元真夏'), kosaka:f('小坂菜緒')};
  });
  S.chk('櫸→櫻兩份名冊的人只算一次',
        T.moriya&&T.moriya.spans===2&&T.moriya.days===2312,
        T.moriya&&T.moriya.days+'天/'+T.moriya.spans+'段');
  S.chk('守屋茜沒有被加成兩倍（相加會是 4624）',
        T.moriya&&T.moriya.days<T.moriya.sum, T.moriya&&T.moriya.sum);
  S.chk('長濱ねる兩團重疊期間只算一次',
        T.neru&&T.neru.spans>=2&&T.neru.days===1338,
        T.neru&&T.neru.days+'天/'+T.neru.spans+'段');
  S.chk('長濱ねる已畢業', T.neru&&T.neru.active===false);
  S.chk('齋藤飛鳥天數正確', T.asuka&&T.asuka.days===4150, T.asuka&&T.asuka.days);
  S.chk('秋元真夏天數正確', T.manatsu&&T.manatsu.days===4207, T.manatsu&&T.manatsu.days);
  S.chk('秋元真夏年資 11 年', T.manatsu&&T.manatsu.years===11, T.manatsu&&T.manatsu.years);
  S.chk('櫸坂區間被櫻坂包住時取長的那段',
        T.tamura&&T.tamura.days<T.tamura.sum, T.tamura&&T.tamura.days+'/'+T.tamura.sum);
  S.chk('田村保乃算現役', T.tamura&&T.tamura.active===true);
  S.chk('小坂菜緒歸在日向坂', T.kosaka&&T.kosaka.main==='hinata', T.kosaka&&T.kosaka.main);
  S.chk('人數合理（200 人以上）', T.n>=200, T.n);

  // ── 全名單的不變量（不寫死數字，所以不會隨時間壞掉）──
  const INV=await p.evaluate(()=>{
    const t=tenureMap(), DAY=86400000, bad={over:[],year:[],neg:[],main:[],act:[],span:[]};
    Object.keys(t).forEach(n=>{
      const m=t[n];
      const sum=Math.round(Object.values(m.byGroup).reduce((a,x)=>a+x,0)/DAY);
      if(m.days>sum+1)bad.over.push(n);                       // 聯集不可能比相加長
      if(m.years!==Math.floor(m.days/365.25))bad.year.push(n);
      if(m.days<0)bad.neg.push(n);
      if(!m.mainGroup)bad.main.push(n);
      if(!m.spans.length)bad.span.push(n);
      if(m.spans.some(s=>s[1]<s[0]))bad.span.push(n);          // 結束不可能早於開始
      // active 要跟「名冊上沒有畢業日」一致
      const anyActive=ALL_GROUPS.some(g=>{
        const i=getAllMembers(g)[n]; return i&&i.joined&&!i.grad;});
      if(anyActive!==m.active)bad.act.push(n);
    });
    return bad;
  });
  S.chk('沒有人的天數大於各團加總', INV.over.length===0, INV.over.slice(0,5).join(','));
  S.chk('年資＝天數／365.25 無條件捨去', INV.year.length===0, INV.year.slice(0,5).join(','));
  S.chk('沒有負天數', INV.neg.length===0, INV.neg.slice(0,5).join(','));
  S.chk('每個人都有主要團體', INV.main.length===0, INV.main.slice(0,5).join(','));
  S.chk('每段區間都是正的', INV.span.length===0, INV.span.slice(0,5).join(','));
  S.chk('現役旗標與名冊的畢業日一致', INV.act.length===0, INV.act.slice(0,5).join(','));

  // 現役成員的天數要跟著今天走，不能是固定值
  const LIVE=await p.evaluate(()=>{
    const t=tenureMap(), DAY=86400000, now=Date.now(), bad=[];
    Object.keys(t).filter(n=>t[n].active).forEach(n=>{
      const first=Math.min(...t[n].spans.map(s=>s[0]));
      const expect=Math.round((now-first)/DAY);
      if(Math.abs(t[n].days-expect)>1)bad.push(n+'('+t[n].days+'≠'+expect+')');
    });
    return bad;
  });
  S.chk('現役成員算到今天為止', LIVE.length===0, LIVE.slice(0,3).join(' '));

  // ── 排行榜畫面 ──
  await p.click('button[onclick="toggleRankPanel()"]'); await p.waitForTimeout(600);
  const activeBtn=()=>p.evaluate(()=>['rs-ctr','rs-sel','rs-ten']
    .filter(id=>document.getElementById(id).style.fontWeight==='700'));
  const rows=()=>p.locator('#rank-panel-body .rank-row').count();
  const head=async()=>[await p.locator('#rk-h1').textContent(),
                       await p.locator('#rk-h2').textContent()];

  S.chk('預設是 Center 模式', JSON.stringify(await activeBtn())==='["rs-ctr"]', await activeBtn());
  const ctrN=await rows();
  await p.click('#rs-sel'); await p.waitForTimeout(500);
  const selN=await rows(), selHead=await head();
  await p.click('#rs-ten'); await p.waitForTimeout(600);
  const tenN=await rows(), tenHead=await head();

  S.chk('同時只有一顆按鈕是選取狀態', JSON.stringify(await activeBtn())==='["rs-ten"]', await activeBtn());
  S.chk('在籍天數表頭是「天數／年資」', tenHead[0]==='天數'&&tenHead[1]==='年資', tenHead.join('/'));
  S.chk('選拔次數表頭是「選拔／C次數」', selHead[0]==='選拔'&&selHead[1]==='C次數', selHead.join('/'));
  S.chk('在籍天數的名單＝有入團日的所有人', tenN===T.n, tenN+' vs '+T.n);
  S.chk('選拔次數列出每個入選過的人（不只當過 Center 的）',
        selN>ctrN&&selN>100, 'sel='+selN+' ctr='+ctrN);
  S.chk('在籍天數的人比入選過的多', tenN>selN, tenN+' > '+selN);

  const cells=r=>r.evaluate(e=>({pos:e.querySelector('.rank-pos').textContent,
    name:e.querySelector('.rank-name').textContent,
    v1:e.querySelector('.rank-ctr').textContent,
    v2:e.querySelector('.rank-sel').textContent,
    tip:e.getAttribute('title')}));
  const all=await p.locator('#rank-panel-body .rank-row').all();
  const top=[]; for(const r of all.slice(0,15)) top.push(await cells(r));

  S.chk('第一名有金牌', top[0].pos==='🥇', top[0].pos);
  S.chk('第一名是秋元真夏 4207 天',
        top[0].name==='秋元真夏'&&top[0].v1==='4207', top[0].name+'/'+top[0].v1);
  const nums=top.map(t=>parseInt(t.v1,10));
  S.chk('天數由大到小排', nums.every((v,i)=>i===0||v<=nums[i-1]), nums.join(','));
  S.chk('年資欄都帶「年」', top.every(t=>/年/.test(t.v2)), top.map(t=>t.v2).join(','));
  S.chk('前三名是金銀銅', top.slice(0,3).map(t=>t.pos).join('')==='🥇🥈🥉',
        top.slice(0,3).map(t=>t.pos).join(''));

  // 同分同名次：不指定是誰，從實際結果裡找相鄰的同分
  const ties=top.filter((t,i)=>i>0&&t.v1===top[i-1].v1&&t.v2===top[i-1].v2);
  S.chk('有找到同分的例子可驗', ties.length>0, ties.length);
  S.chk('同分的名次相同',
        ties.every(t=>{const prev=top[top.indexOf(t)-1];return t.pos===prev.pos;}),
        ties.map(t=>t.pos+':'+t.name).join(' '));

  const mark=await p.evaluate(()=>{
    const t=tenureMap();
    const rs=[...document.querySelectorAll('#rank-panel-body .rank-row')];
    return {bad:rs.filter(r=>{
        const n=r.querySelector('.rank-name').textContent;
        const plus=r.querySelector('.rank-sel').textContent.includes('＋');
        return t[n]&&t[n].active!==plus;
      }).map(r=>r.querySelector('.rank-name').textContent).slice(0,5),
      tipActive:(rs.find(r=>r.querySelector('.rank-sel').textContent.includes('＋'))||{}).title,
      tipGone:(rs.find(r=>!r.querySelector('.rank-sel').textContent.includes('＋'))||{}).title};
  });
  S.chk('只有現役成員標「＋」', mark.bad.length===0, mark.bad.join(','));
  S.chk('提示寫出天數', /在籍 \d+ 天/.test(mark.tipGone||''), mark.tipGone);
  S.chk('現役的提示註明仍在累計',
        (mark.tipActive||'').includes('現役，仍在累計'), mark.tipActive);
  S.chk('已畢業的提示不寫現役', !(mark.tipGone||'').includes('現役'), mark.tipGone);

  await p.click('#rs-ctr'); await p.waitForTimeout(500);
  S.chk('切回 Center 模式後在籍提示清掉',
        await p.evaluate(()=>!document.querySelector('#rank-panel-body .rank-row').getAttribute('title')));
  S.chk('Center 模式人數不變', (await rows())===ctrN);

  // ── 不把資料當 HTML ──
  await p.evaluate(async()=>{
    const bad='<img src=x onerror="window.__pwned(\'ten\')">';
    const d=window.__store.nogi['42'];
    const r0=d.row0.slice(); r0[0]=bad;
    const bk=(d.back||[]).slice(); bk[0]=bad;
    await db.collection('nogi').doc('42').update({row0:r0,back:bk});
  });
  await p.waitForTimeout(1000);
  await p.click('#rs-sel'); await p.waitForTimeout(700);
  S.chk('排行榜沒有執行注入', fired.length===0, fired.join(','));
  S.chk('排行榜沒有 img 節點', (await p.locator('#rank-panel-body img').count())===0);
  S.chk('注入的字串當純文字顯示',
        (await p.locator('#rank-panel-body .rank-name').allTextContents())
          .some(t=>t.includes('<img')));

  await b.close();
  const r=S.report();
  process.exit(r.fail||r.errors?1:0);
})();
