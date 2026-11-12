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

  // 改大塊程式時曾經整段取代，順手把中間幾個函式一起刪掉（pollOpen、
  // cleanNick、voteId），而因為它們是在事件裡才被呼叫，所有測試都沒抓到。
  // 這裡直接點名核心函式，少一個就立刻紅。
  const CORE=['getData','getBase','getAllMembers','activeAt','lineupOf','lineupDiff',
    'tenureMap','mergeSpans','careerStats','memberTrajectory','underRowsOf',
    'centerOfRows','underLabel','selCountOf','elWith','showMsg','openModal',
    'closeModal','canEdit','playerName','cleanNick','cleanUserId','voteId',
    'pollId','pollKey','pollKeyOf','pollType','pollOpen','pollAnswer','pollTally',
    'pollCandidates','pollCandsFor','pollKindLabel','pollHistory','historyStats',
    'crowdPick','hitBy','settleShares','settlePoll','placeBet','registerPlayer',
    'loginPlayer','ensureWallet','idToEmail','buildQuiz','startQuiz','answerQuiz',
    'finishQuiz','buildPollList','buildPollCard','buildNewPollForm','buildHistory',
    'buildRankTable','compositionOf','singleDate','toDoc','fromDoc'];
  const missing=await p.evaluate(names=>names.filter(n=>{
    try{ return typeof eval(n)!=='function'; }catch(e){ return true; }
  }),CORE);
  S.chk('核心函式一個都沒少', missing.length===0, missing.join(','));
  const consts=await p.evaluate(()=>{
    const want=['ALL_GROUPS','GROUP_NAME','BET_TYPES','POLL_COL','WALLET_COL',
                'BET_COL','START_COIN','QUIZ_N','QUIZ_PER','NICK_MAX','ADMIN_UIDS'];
    return want.filter(n=>{try{return eval(n)===undefined;}catch(e){return true;}});
  });
  S.chk('核心常數一個都沒少', consts.length===0, consts.join(','));

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
  // 選拔／Under 的切換選單只長在有 under 曲的單曲上，所以看整頁而不是第一張
  const picks=await p.locator('#nogi-grid .fm-pick').count();
  S.chk('有 under 曲的單曲帶站位切換選單', picks>0, picks);

  await p.evaluate(()=>openMemberPanel('nogi','岩本蓮加')); await p.waitForTimeout(900);
  S.chk('成員面板打得開', (await p.locator('#member-panel.open').count())===1);
  S.chk('成員面板有生涯圖', (await p.locator('#member-panel svg').count())>0);
  S.chk('成員面板有基本資料', (await p.locator('#member-panel .mp-row').count())>0);
  // 現役成員要看得到出身地／身高／血型；沒有這些資料的人不該出現空白列
  const MP=await p.evaluate(()=>{
    const read=()=>[...document.querySelectorAll('#member-panel .mp-row')]
      .map(r=>r.querySelector('.mp-lbl').textContent+'='+
              r.querySelector('.mp-val').textContent);
    openMemberPanel('nogi','井上和');
    const cur=read();
    openMemberPanel('nogi','岩瀬佑美子');     // 名冊裡沒有這三筆資料的人
    const old=read();
    return {cur,old};
  });
  S.chk('現役成員看得到出身地',
        MP.cur.some(x=>x==='出身地=神奈川県'), MP.cur.join(' / '));
  S.chk('現役成員看得到身高', MP.cur.some(x=>x==='身高=158 cm'), MP.cur.join(' / '));
  S.chk('現役成員看得到血型', MP.cur.some(x=>x==='血型=B 型'), MP.cur.join(' / '));
  S.chk('三列排在生日後面、入團日期前面',
        MP.cur.findIndex(x=>x.startsWith('生日'))
          <MP.cur.findIndex(x=>x.startsWith('出身地'))
        &&MP.cur.findIndex(x=>x.startsWith('血型'))
          <MP.cur.findIndex(x=>x.startsWith('入團日期')), MP.cur.join(' / '));
  S.chk('沒有這些資料的人不會多出空白列',
        !MP.old.some(x=>/^(出身地|身高|血型)=/.test(x)), MP.old.join(' / '));

  await b.close();
  const r=S.report();
  process.exit(r.fail||r.errors?1:0);
})();
