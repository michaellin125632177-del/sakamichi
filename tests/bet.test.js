// 虛擬籌碼下注：帳號、錢包、下注、同注分彩結算。
//
// ※ 測的是前端那一半。firestore.rules 擋不擋得住惡意寫入，假的 Firebase
//   沒有規則引擎，只能在線上驗。
const {launch,openPage,seed,suite,ADMIN_UID}=require('./lib');
const S=suite('虛擬籌碼下注');

const mkPoll=(p,o={})=>p.evaluate(async o=>{
  const g=o.g||'nogi', id=pollId(g,o.num||80,'sel');
  await db.collection('polls').doc(id).set({
    group:g,num:o.num||80,kind:'sel',title:o.title||'賭盤測試',deadline:'',
    candidates:o.cands||pollCandidates(g),tally:o.tally||{},
    voteCount:o.voteCount||0,pool:o.pool||0,settled:false,
    answer:'',closed:!!o.closed,createdAt:1});
  return id;
},o);
const seedSingles=p=>p.evaluate(async()=>{
  const batch=db.batch();
  ['nogi','hinata','sakura','keyaki','aoba'].forEach(g=>
    getBase(g).forEach(e=>batch.set(db.collection(g).doc(String(e.num)),toDoc({...e}))));
  await batch.commit();
});

(async()=>{
  const b=await launch();

  // ── 分彩算法（純函式，先單獨驗）──
  let p=await openPage(b,{auth:{uid:ADMIN_UID,name:'站長'},
                          viewport:{width:900,height:950},onError:S.onError});
  await seed(p);
  const M=await p.evaluate(()=>{
    const bets=[{uid:'a',name:'A',pick:'甲',stake:300},
                {uid:'b',name:'B',pick:'甲',stake:100},
                {uid:'c',name:'C',pick:'乙',stake:600}];
    return {win:settleShares(bets,'甲'), none:settleShares(bets,'丙'),
            wc:settleShares(bets,'甲、丙'),
            one:settleShares([{uid:'a',name:'A',pick:'甲',stake:50}],'甲'),
            empty:settleShares([],'甲'),
            odd:settleShares([{uid:'a',name:'A',pick:'甲',stake:1},
                              {uid:'b',name:'B',pick:'甲',stake:2},
                              {uid:'c',name:'C',pick:'乙',stake:7}],'甲')};
  });
  S.chk('彩池是所有注額的總和', M.win.pool===1000, M.win.pool);
  S.chk('按注額比例分彩池',
        M.win.rows.map(r=>r.payout).join()==='750,250',
        M.win.rows.map(r=>r.name+':'+r.payout).join(' '));
  S.chk('發出去的剛好等於彩池，不會憑空生錢',
        M.win.rows.reduce((a,r)=>a+r.payout,0)===M.win.pool,
        M.win.rows.reduce((a,r)=>a+r.payout,0)+' vs '+M.win.pool);
  S.chk('沒押中的拿不到錢', M.win.rows.every(r=>r.name!=='C'));
  S.chk('無人猜中就全額退還', M.none.refund===true);
  S.chk('退款是原銀奉還',
        M.none.rows.every(r=>r.payout===r.stake), JSON.stringify(M.none.rows));
  S.chk('W-center 猜中其一照樣分',
        M.wc.rows.length===2&&M.wc.rows[0].payout===750, JSON.stringify(M.wc.rows));
  S.chk('只有一個人下注就全拿回去', M.one.rows[0].payout===50, M.one.rows[0].payout);
  S.chk('沒有人下注不會爆', M.empty.pool===0&&M.empty.rows.length===0);
  S.chk('除不盡時無條件捨去，發出去不會超過彩池',
        M.odd.rows.reduce((a,r)=>a+r.payout,0)<=M.odd.pool,
        M.odd.rows.map(r=>r.payout).join()+' / '+M.odd.pool);

  // ── ID 轉信箱 ──
  const E=await p.evaluate(async()=>({
    zh:await idToEmail('坂道老司機'),
    same:(await idToEmail('Abc'))===(await idToEmail(' abc ')),
    diff:(await idToEmail('甲'))!==(await idToEmail('乙')),
    clean:cleanUserId('  a b@c  '), long:cleanUserId('字'.repeat(40)).length
  }));
  S.chk('中文 ID 轉得出合法信箱',
        /^u[0-9a-f]{32}@users\.sakamichidb\.com$/.test(E.zh), E.zh);
  S.chk('信箱帳號部分沒超過長度限制', E.zh.split('@')[0].length<=64, E.zh.split('@')[0].length);
  S.chk('大小寫與空白先正規化，不會變成兩個帳號', E.same);
  S.chk('不同 ID 不會撞', E.diff);
  S.chk('ID 濾掉空白與 @', E.clean==='abc', E.clean);
  S.chk('ID 截到 16 字', E.long===16, E.long);
  await p.close();

  // ── 註冊 → 下注 ──
  p=await openPage(b,{auth:{signedOut:true},viewport:{width:900,height:950},
                      onError:S.onError});
  await seedSingles(p);
  const PID=await mkPoll(p,{num:80});
  await p.waitForTimeout(1100);
  await p.click('#poll-btn'); await p.waitForTimeout(600);
  S.chk('沒登入就先擋下來', (await p.locator('#lg-id').count())===1);
  S.chk('沒登入看不到下注選單', (await p.locator('#pv-sel-'+PID).count())===0);
  S.chk('說明只留一句',
        (await p.locator('.lg-note').textContent()).trim()==='取一組只有你知道的 ID 與密碼。',
        await p.locator('.lg-note').textContent());
  S.chk('警告寫 ID 跟密碼都救不回來',
        (await p.locator('.lg-warn').textContent()).includes('ID 跟密碼忘了救不回來'),
        await p.locator('.lg-warn').textContent());

  await p.fill('#lg-id','坂道老司機'); await p.fill('#lg-pw','hunter22');
  await p.click('.lg-row .pg-btn'); await p.waitForTimeout(1600);
  const W=await p.evaluate(()=>({w:myWallet,uid:authUser&&authUser.uid,
                                 anon:authUser&&authUser.isAnonymous}));
  S.chk('註冊完有錢包', !!W.w, JSON.stringify(W.w));
  S.chk('起始籌碼 1000', W.w&&W.w.balance===1000, W.w&&W.w.balance);
  S.chk('錢包記著 ID', W.w&&W.w.name==='坂道老司機', W.w&&W.w.name);
  S.chk('這是正式帳號不是匿名', W.anon===false);
  S.chk('看得到餘額列', (await p.locator('.wl-coin').textContent()).includes('1,000'),
        await p.locator('.wl-coin').textContent());

  // 內部信箱是 ID 雜湊出來的，不該出現在任何地方
  const NM=await p.evaluate(()=>({
    name:playerName(),
    btn:document.getElementById('auth-btn').textContent,
    title:document.getElementById('auth-btn').title,
    body:document.body.innerText,
    email:authUser.email}));
  S.chk('顯示名就是玩家取的 ID', NM.name==='坂道老司機', NM.name);
  S.chk('右上角按鈕顯示名字，不是雜湊信箱',
        NM.btn.includes('坂道老司機')&&!/u[0-9a-f]{8}/.test(NM.btn), NM.btn);
  S.chk('按鈕提示也不露出信箱', !/@users\./.test(NM.title), NM.title);
  S.chk('整個畫面都看不到內部信箱',
        !NM.body.includes(NM.email)&&!/@users\.sakamichidb/.test(NM.body),
        NM.body.slice(0,60));
  S.chk('錢包列顯示名字', (await p.locator('.wl-name').textContent()).includes('坂道老司機'),
        await p.locator('.wl-name').textContent());
  S.chk('登入後出現下注選單', (await p.locator('#pv-sel-'+PID).count())===1);

  // 下注前看不到票數
  S.chk('下注前看不到票數', (await p.locator('#poll-list>.poll-card .pv').count())===0);
  await p.selectOption('#pv-sel-'+PID,'賀喜遥香'); await p.waitForTimeout(200);
  await p.fill('#pv-amt-'+PID,'300'); await p.waitForTimeout(200);
  await p.click('.poll-pick .btn-save'); await p.waitForTimeout(1500);
  const B=await p.evaluate(id=>({
    bal:myWallet.balance, pool:pollData.find(x=>x.id===id).pool,
    tally:pollData.find(x=>x.id===id).tally,
    bet:Object.values(window.__store.bets)[0],
    betId:Object.keys(window.__store.bets)[0],
    lastBet:window.__store.wallets[authUser.uid].lastBet,
    bars:document.querySelectorAll('#poll-list>.poll-card .pv-row').length}),PID);
  S.chk('餘額扣掉注額', B.bal===700, B.bal);
  S.chk('彩池加上注額', B.pool===300, B.pool);
  S.chk('票數照樣累加（歷來統計才接得上）', B.tally['賀喜遥香']===1, JSON.stringify(B.tally));
  S.chk('注單寫得進去', B.bet&&B.bet.stake===300&&B.bet.pick==='賀喜遥香',
        JSON.stringify(B.bet));
  S.chk('注單帶著 ID', B.bet&&B.bet.name==='坂道老司機', B.bet&&B.bet.name);
  S.chk('注單 id 是 預測_uid（一人一注）', B.betId===PID+'_'+B.bet.uid, B.betId);
  S.chk('錢包寫下 lastBet 給規則核對金額', B.lastBet===PID, B.lastBet);
  S.chk('下注後看得到票數', B.bars===1, B.bars);

  // 餘額不夠
  const over=await p.evaluate(async id=>{
    try{await placeBet(id,'井上和',99999);return 'should-not-pass';}
    catch(e){return e.message;}},PID);
  S.chk('籌碼不夠會被擋', /籌碼不夠/.test(over), over);
  const zero=await p.evaluate(async id=>{
    try{await placeBet(id,'井上和',0);return 'should-not-pass';}
    catch(e){return e.message;}},PID);
  S.chk('下注 0 會被擋', /大於 0/.test(zero), zero);
  const neg=await p.evaluate(async id=>{
    try{await placeBet(id,'井上和',-50);return 'should-not-pass';}
    catch(e){return e.message;}},PID);
  S.chk('負數會被擋', /大於 0/.test(neg), neg);
  S.chk('被擋下來的都沒有動到餘額', await p.evaluate(()=>myWallet.balance===700),
        await p.evaluate(()=>myWallet.balance));

  // 登出就回到登入畫面
  await p.evaluate(()=>firebaseAuth.signOut()); await p.waitForTimeout(900);
  S.chk('登出後又要登入', (await p.locator('#lg-id').count())===1);
  // 再登入回來，籌碼還在（換瀏覽器也認得的那個重點）
  await p.fill('#lg-id','坂道老司機'); await p.fill('#lg-pw','hunter22');
  await p.click('.lg-row .btn-save'); await p.waitForTimeout(1600);
  S.chk('重新登入籌碼還在', await p.evaluate(()=>myWallet&&myWallet.balance===700),
        await p.evaluate(()=>myWallet&&myWallet.balance));
  S.chk('重新登入名字也還在', await p.evaluate(()=>playerName())==='坂道老司機',
        await p.evaluate(()=>playerName()));
  const bad=await p.evaluate(async()=>{
    try{await loginPlayer('坂道老司機','wrongpass');return 'should-not-pass';}
    catch(e){return e.message;}});
  S.chk('密碼錯了登不進去', /不對/.test(bad), bad);
  const dup=await p.evaluate(async()=>{
    try{await registerPlayer('坂道老司機','another1');return 'should-not-pass';}
    catch(e){return e.message;}});
  S.chk('同一個 ID 註冊不了第二次', /已經有人用/.test(dup), dup);
  const shortPw=await p.evaluate(async()=>{
    try{await registerPlayer('新玩家','123');return 'should-not-pass';}
    catch(e){return e.message;}});
  S.chk('密碼太短註冊不了', /至少/.test(shortPw), shortPw);
  await p.close();

  // ── 結算 ──
  p=await openPage(b,{auth:{uid:ADMIN_UID,name:'站長'},
                      viewport:{width:900,height:950},onError:S.onError});
  await seed(p);
  const R=await p.evaluate(async()=>{
    const id=pollId('nogi',42,'sel');   // 第42張的 center 是 一ノ瀬美空
    await db.collection('polls').doc(id).set({group:'nogi',num:42,kind:'sel',
      title:'是非に及ばず',deadline:'',candidates:pollCandidates('nogi'),
      tally:{'一ノ瀬美空':2,'賀喜遥香':1},voteCount:3,pool:1000,settled:false,
      answer:'',closed:false,createdAt:1});
    for(const [uid,name,pick,stake] of [
      ['w1','阿坂','一ノ瀬美空',300],['w2','小明','一ノ瀬美空',100],
      ['L1','路人','賀喜遥香',600]]){
      await db.collection('wallets').doc(uid).set({name,balance:0,createdAt:1});
      await db.collection('bets').doc(id+'_'+uid).set({pollId:id,uid,name,pick,stake,at:1});
    }
    const r=await settlePoll(id);
    return {ans:pollAnswer(pollData.find(x=>x.id===id)),rows:r.rows,
      w1:window.__store.wallets.w1.balance,
      w2:window.__store.wallets.w2.balance,
      L1:window.__store.wallets.L1.balance,
      settled:window.__store.polls[id].settled,
      payouts:window.__store.polls[id].payouts,id};
  });
  S.chk('答案自動取自單曲的 center', R.ans==='一ノ瀬美空', R.ans);
  S.chk('猜中的人拿到錢', R.w1===750&&R.w2===250, R.w1+'/'+R.w2);
  S.chk('沒猜中的一毛也沒有', R.L1===0, R.L1);
  S.chk('發出去的總額等於彩池', R.w1+R.w2===1000, R.w1+R.w2);
  S.chk('標記成已結算', R.settled===true);
  S.chk('結算結果寫進預測裡（大家看得到誰贏了）',
        Array.isArray(R.payouts)&&R.payouts.length===2, JSON.stringify(R.payouts));
  const again=await p.evaluate(async id=>{
    try{await settlePoll(id);return 'should-not-pass';}
    catch(e){return e.message;}},R.id);
  S.chk('不能重複結算（否則會一直發錢）', /已經結算過/.test(again), again);

  // 還沒開獎不能結算
  const early=await p.evaluate(async()=>{
    const id=pollId('nogi',95,'sel');
    await db.collection('polls').doc(id).set({group:'nogi',num:95,kind:'sel',
      title:'還沒開獎',deadline:'',candidates:['賀喜遥香'],tally:{'賀喜遥香':1},
      voteCount:1,pool:50,settled:false,answer:'',closed:false,createdAt:1});
    await new Promise(r=>setTimeout(r,600));
    try{await settlePoll(id);return 'should-not-pass';}
    catch(e){return e.message;}});
  S.chk('還沒開獎不能結算', /還沒開獎/.test(early), early);

  S.chk('站長也有結算按鈕',
        await p.evaluate(()=>{openPollModal();
          return !!document.querySelector('.pg-btn.settle')
            ||pollData.every(x=>x.settled||!pollAnswer(x)||!(x.pool>0));}));
  await b.close();
  const r=S.report();
  process.exit(r.fail||r.errors?1:0);
})();
