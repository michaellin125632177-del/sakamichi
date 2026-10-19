// 整體煙霧測試：主要畫面都還畫得出來、沒有 JS 錯誤。
const {launch,openPage,seed,suite}=require('./lib');
const S=suite('整體煙霧測試');

(async()=>{
  const b=await launch();
  const p=await openPage(b,{viewport:{width:1200,height:1000},onError:S.onError});
  p.on('console',m=>{
    if(m.type()==='error'&&
       !/favicon|gstatic|firebasejs|sw\.js|ServiceWorker|TUNNEL|404|Failed to load resource/
         .test(m.text()))S.err('CONSOLE: '+m.text());
  });
  await seed(p);

  for(const g of ['nogi','hinata','sakura','keyaki'])
    S.chk('『'+g+'』有卡片', (await p.locator('#'+g+'-grid .card').count())>0,
          await p.locator('#'+g+'-grid .card').count());

  // 名冊：不受選單的在籍過濾影響，要看得到完整名冊
  await p.click('button[onclick="openRoster()"]'); await p.waitForTimeout(900);
  S.chk('成員名冊仍列出全部期別', await p.evaluate(()=>gensOf('nogi').length)===6);
  S.chk('名冊看得到已畢業成員',
        await p.evaluate(()=>Object.keys(getAllMembers('nogi')).includes('白石麻衣')));
  await p.evaluate(()=>closeModal('rosterModal')); await p.waitForTimeout(400);

  // 排行榜三種排法
  await p.click('button[onclick="toggleRankPanel()"]'); await p.waitForTimeout(700);
  const rows=async()=>p.locator('#rank-panel-body .rank-row').count();
  await p.click('#rs-ten'); await p.waitForTimeout(600);
  const ten=await rows();
  S.chk('在籍天數排行榜畫得出來', ten>100, ten);
  S.chk('在籍天數表頭正確',
        (await p.locator('#rk-h1').textContent())==='天數'&&
        (await p.locator('#rk-h2').textContent())==='年資');
  await p.click('#rs-sel'); await p.waitForTimeout(500);
  const sel=await rows();
  await p.click('#rs-ctr'); await p.waitForTimeout(500);
  const ctr=await rows();
  S.chk('選拔次數列出的人比 Center 多', sel>ctr&&sel>100, 'sel='+sel+' ctr='+ctr);
  S.chk('在籍天數列出的人最多', ten>sel, ten+' > '+sel);
  await p.click('button[onclick="toggleRankPanel()"]'); await p.waitForTimeout(400);

  // 其他面板
  await p.click('button[onclick="openComp()"]'); await p.waitForTimeout(900);
  S.chk('組成推移圖畫得出來', (await p.locator('#cp-chart svg').count())===1);
  await p.evaluate(()=>closeModal('compModal')); await p.waitForTimeout(400);

  const card=p.locator('#nogi-grid .card').first();
  S.chk('站位圖有站位標籤', (await card.locator('.fm .tag').count())>0);
  S.chk('站位切換選單還在', (await card.locator('.fm-pick').count())>0);

  await p.evaluate(()=>openMemberPanel('nogi','岩本蓮加')); await p.waitForTimeout(900);
  S.chk('成員面板打得開', (await p.locator('#member-panel.open').count())===1);
  S.chk('成員面板有生涯圖', (await p.locator('#member-panel svg').count())>0);
  S.chk('成員面板有基本資料', (await p.locator('#member-panel .mp-row').count())>0);

  await b.close();
  const r=S.report();
  process.exit(r.fail||r.errors?1:0);
})();
