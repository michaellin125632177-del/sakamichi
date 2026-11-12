// C 位預測：候選名單、匿名投票、票數累加、投完才看得到票數、開獎。
//
// ※ 這裡測的是前端那一半。Firestore 規則（firestore.rules）擋不擋得住
//   惡意寫入，假的 Firebase 沒有規則引擎，測不到——那只能在線上驗。
const {launch,openPage,seed,suite,ADMIN_UID}=require('./lib');
const S=suite('C 位預測');

const mkPoll=(p,o={})=>p.evaluate(async o=>{
  const g=o.g||'nogi', kind=o.kind||'sel';
  await db.collection('polls').doc(pollId(g,o.num||44,kind)).set({
    group:g,num:o.num||44,kind,title:o.title||'テスト曲',
    deadline:o.deadline||'',candidates:o.cands||pollCandidates(g),
    tally:o.tally||{},voteCount:o.voteCount||0,answer:o.answer||'',
    closed:!!o.closed,createdAt:Date.now()});
},o);

(async()=>{
  const b=await launch();

  // ── 候選名單：只列當下在籍的人 ──
  let p=await openPage(b,{auth:{uid:ADMIN_UID,name:'站長'},
                          viewport:{width:900,height:1000},onError:S.onError});
  await seed(p);
  const C=await p.evaluate(()=>{
    const c=pollCandidates('nogi'), all=getAllMembers('nogi');
    return {n:c.length,
      有已畢業的:c.filter(n=>all[n]&&all[n].grad).slice(0,3),
      有現役的:c.some(n=>all[n]&&!all[n].grad),
      有排序:c.every((v,i)=>i===0||v.localeCompare(c[i-1],'ja')>=0)};
  });
  S.chk('候選名單不含已畢業成員', C.有已畢業的.length===0, C.有已畢業的.join(','));
  S.chk('候選名單有現役成員', C.有現役的&&C.n>10, C.n+' 人');
  S.chk('候選名單有排序', C.有排序);

  // ── 暱稱清理 ──
  const N=await p.evaluate(()=>({
    trim:cleanNick('  阿坂  '),
    ctrl:cleanNick('壞\u0000人\u001f'),
    long:cleanNick('一'.repeat(40)).length,
    empty:cleanNick(null),
    html:cleanNick('<img src=x>')
  }));
  S.chk('暱稱去頭尾空白', N.trim==='阿坂', N.trim);
  S.chk('暱稱濾掉控制字元', N.ctrl==='壞人', N.ctrl);
  S.chk('暱稱截到 16 字', N.long===16, N.long);
  S.chk('空暱稱不會爆', N.empty==='', JSON.stringify(N.empty));
  S.chk('暱稱不改寫內容（靠 textContent 防注入，不是靠過濾）',
        N.html==='<img src=x>', N.html);

  // ── 開關判定 ──
  const O=await p.evaluate(()=>({
    plain:pollOpen({closed:false,answer:'',deadline:''}),
    closed:pollOpen({closed:true,answer:'',deadline:''}),
    answered:pollOpen({closed:false,answer:'賀喜遥香',deadline:''}),
    past:pollOpen({closed:false,answer:'',deadline:'2020-01-01T00:00'}),
    future:pollOpen({closed:false,answer:'',deadline:'2099-01-01T00:00'}),
    junk:pollOpen({closed:false,answer:'',deadline:'看不懂'}),
    // 單曲已經有 center 了：就算 answer 欄位是空的也該關
    resolved:pollOpen({closed:false,answer:'',deadline:'',group:'nogi',num:42})
  }));
  S.chk('一般狀態是開著的', O.plain);
  S.chk('手動截止就關了', O.closed===false);
  S.chk('有答案就關了', O.answered===false);
  S.chk('過了截止時間就關了', O.past===false);
  S.chk('還沒到截止時間就開著', O.future);
  S.chk('截止時間看不懂時不會誤關', O.junk);
  S.chk('單曲一公布 center 就自動關閉（不能在答案攤開後還投）',
        O.resolved===false, O.resolved);

  // ── 投票流程 ──
  await mkPoll(p,{num:44});
  await p.waitForTimeout(900);
  S.chk('按鈕顯示進行中的預測數',
        (await p.locator('#poll-btn').textContent()).includes('1'),
        await p.locator('#poll-btn').textContent());
  await p.click('#poll-btn'); await p.waitForTimeout(600);
  S.chk('視窗打得開', (await p.locator('#pollModal.open').count())===1);
  S.chk('投票前看不到票數', (await p.locator('.pv').count())===0);
  S.chk('投票前有候選下拉', (await p.locator('#pv-sel-nogi_44').count())===1);
  const PH=await p.evaluate(()=>{
    const o=document.querySelector('#pv-sel-nogi_44 option');
    return {hidden:o.hidden,disabled:o.disabled,value:o.value,
            selected:document.querySelector('#pv-sel-nogi_44').value};
  });
  S.chk('提示選項不出現在展開的清單裡', PH.hidden===true);
  S.chk('提示選項選不到', PH.disabled===true);
  S.chk('一開始沒有預設選中任何成員（免得手滑送出不能改的票）',
        PH.selected==='', JSON.stringify(PH.selected));
  S.chk('沒選人時送出鈕是關的',
        await p.evaluate(()=>document.querySelector('.poll-pick .btn-save').disabled));
  S.chk('下拉不含已畢業成員',
        !(await p.locator('#pv-sel-nogi_44').allTextContents())[0].includes('白石麻衣'));

  await p.fill('#poll-nick','坂道老司機');
  await p.selectOption('#pv-sel-nogi_44','賀喜遥香'); await p.waitForTimeout(200);
  await p.click('.poll-pick .btn-save'); await p.waitForTimeout(1200);

  const V=await p.evaluate(()=>{
    const pl=pollData.find(x=>x.id==='nogi_44');
    const v=Object.values(window.__store.votes)[0];
    return {tally:pl.tally,voteCount:pl.voteCount,vote:v,
            voteDocId:Object.keys(window.__store.votes)[0],
            bars:document.querySelectorAll('.pv-row').length,
            stillPicker:document.querySelectorAll('#pv-sel-nogi_44').length,
            nickSaved:localStorage.getItem('sakamichi-nick')};
  });
  S.chk('票數累加到 1', V.tally['賀喜遥香']===1&&V.voteCount===1, JSON.stringify(V.tally));
  S.chk('票有寫進去', V.vote&&V.vote.pick==='賀喜遥香', JSON.stringify(V.vote));
  S.chk('票帶著暱稱', V.vote&&V.vote.nick==='坂道老司機', V.vote&&V.vote.nick);
  S.chk('票的 id 是 預測_uid（所以一人只佔得到一格）',
        V.voteDocId==='nogi_44_'+ADMIN_UID, V.voteDocId);
  S.chk('投完看得到票數', V.bars===1, V.bars);
  S.chk('投完就不能再投', V.stillPicker===0, V.stillPicker);
  S.chk('暱稱記在這台裝置上', V.nickSaved==='坂道老司機', V.nickSaved);

  // 第二票投別人，票數要分開累加
  await p.evaluate(async()=>{
    const inc=firebase.firestore.FieldValue.increment(1);
    const batch=db.batch();
    batch.set(db.collection('votes').doc('nogi_44_someone'),
      {pollId:'nogi_44',uid:'someone',pick:'井上和',nick:'路人',at:Date.now()});
    batch.update(db.collection('polls').doc('nogi_44'),
      new firebase.firestore.FieldPath('tally','井上和'),inc,
      new firebase.firestore.FieldPath('voteCount'),inc);
    await batch.commit();
  });
  await p.waitForTimeout(900);
  const V2=await p.evaluate(()=>{
    const pl=pollData.find(x=>x.id==='nogi_44');
    return {tally:pl.tally,voteCount:pl.voteCount,
            bars:[...document.querySelectorAll('.pv-row')]
              .map(r=>r.querySelector('.pv-name').textContent.trim())};
  });
  S.chk('兩個人的票分開累加',
        V2.tally['賀喜遥香']===1&&V2.tally['井上和']===1&&V2.voteCount===2,
        JSON.stringify(V2.tally));
  S.chk('自己投的那個有星號', V2.bars.some(t=>t.startsWith('★')), V2.bars.join(' / '));

  // ── 開獎：單曲建好之後自動對答案 ──
  const A=await p.evaluate(async()=>{
    const before=pollAnswer(pollData.find(x=>x.id==='nogi_44'));
    await db.collection('nogi').doc('44').set(toDoc({
      num:44,title:'テスト曲',zh:'測試',date:'2027年1月1日',total:3,
      center:['賀喜遥香'],rows:[[],[],['賀喜遥香','井上和','遠藤さくら']]}));
    return {before};
  });
  await p.waitForTimeout(1200);
  const A2=await p.evaluate(()=>{
    const pl=pollData.find(x=>x.id==='nogi_44');
    return {answer:pollAnswer(pl),open:pollOpen(pl)};
  });
  S.chk('單曲還沒建好時沒有答案', A.before===null, A.before);
  S.chk('單曲的 center 一填就自動變成答案', A2.answer==='賀喜遥香', A2.answer);
  S.chk('開獎後預測自動關閉', A2.open===false);
  await p.evaluate(()=>buildPollList());
  await p.waitForTimeout(400);
  const txt=await p.locator('#poll-list').textContent();
  S.chk('畫面顯示答案', txt.includes('答案')&&txt.includes('賀喜遥香'));
  S.chk('猜中會講出來', txt.includes('猜中'), txt.slice(0,120));

  // ── 表題曲與 Under 曲各開各的 ──
  const K=await p.evaluate(()=>({
    selId:pollId('nogi',50,'sel'), underId:pollId('nogi',50,'under'),
    oldId:pollId('nogi',50),
    selKind:pollKind({kind:'sel'}), underKind:pollKind({kind:'under'}),
    legacy:pollKind({num:1}),
    selLabel:pollKindLabel({group:'nogi',kind:'sel'}),
    underNogi:pollKindLabel({group:'nogi',kind:'under'}),
    underHinata:pollKindLabel({group:'hinata',kind:'under'}),
    underSakura:pollKindLabel({group:'sakura',kind:'under'})
  }));
  S.chk('表題與 Under 的 id 不一樣（同一張才能各開一個）',
        K.selId!==K.underId, K.selId+' vs '+K.underId);
  S.chk('表題沿用舊的 id 格式（舊預測不會對不上）',
        K.selId===K.oldId&&K.selId==='nogi_50', K.selId);
  S.chk('沒有 kind 的舊預測當成表題曲', K.legacy==='sel', K.legacy);
  S.chk('表題曲的標籤', K.selLabel==='表題曲', K.selLabel);
  S.chk('乃木坂的 Under 叫 under 曲', K.underNogi==='under 曲', K.underNogi);
  S.chk('日向坂的 Under 叫ひなた坂', K.underHinata==='ひなた坂 曲', K.underHinata);
  S.chk('櫻坂的 Under 叫 BACKS', K.underSakura==='BACKS 曲', K.underSakura);

  await mkPoll(p,{num:50,kind:'sel',title:'表題テスト'});
  await mkPoll(p,{num:50,kind:'under',title:'アンダーテスト'});
  await p.waitForTimeout(1000);
  await p.evaluate(()=>buildPollList()); await p.waitForTimeout(400);
  const both=await p.evaluate(()=>[...document.querySelectorAll('.poll-card')]
    .filter(c=>c.textContent.includes('第50張'))
    .map(c=>c.querySelector('.poll-who').textContent));
  S.chk('同一張單曲可以同時有兩個預測', both.length===2, both.length);
  S.chk('兩張卡分別標示表題與 Under',
        both.some(t=>t.includes('表題曲'))&&both.some(t=>t.includes('under 曲')),
        both.join(' | '));
  S.chk('卡片上看得到團名', both.every(t=>t.includes('乃木坂46')), both.join(' | '));

  // Under 的答案取 under 站位前排正中央，不是單曲的 center
  const UA=await p.evaluate(async()=>{
    await db.collection('nogi').doc('50').set(toDoc({
      num:50,title:'表題テスト',zh:'測試',date:'2027年6月1日',total:3,
      center:['井上和'],rows:[[],[],['賀喜遥香','井上和','遠藤さくら']],
      underRows:[[],[],['岩本蓮加','伊藤理々杏','弓木奈於']]}));
    return true;
  });
  await p.waitForTimeout(1200);
  const UA2=await p.evaluate(()=>({
    sel:pollAnswer(pollData.find(x=>x.id==='nogi_50')),
    under:pollAnswer(pollData.find(x=>x.id==='nogi_50_under'))}));
  S.chk('表題的答案是單曲的 center', UA2.sel==='井上和', UA2.sel);
  S.chk('Under 的答案取 under 站位的正中央，不是 center',
        UA2.under==='伊藤理々杏', UA2.under);

  // ── 歷來得票排行 ──
  // 最重要的一點：進行中又還沒投的預測不能算進去，否則這張表
  // 等於把當前票數攤開給還沒投的人看，「投完才看得到」就白做了。
  await p.evaluate(async()=>{
    for(const id of Object.keys(window.__store.polls))
      await db.collection('polls').doc(id).delete();
    await db.collection('polls').doc('nogi_42').set({group:'nogi',num:42,kind:'sel',
      title:'已開獎A',deadline:'',candidates:['一ノ瀬美空','賀喜遥香','井上和'],
      tally:{'一ノ瀬美空':12,'賀喜遥香':7,'井上和':4},voteCount:23,
      answer:'',closed:false,createdAt:1});
    await db.collection('polls').doc('nogi_41').set({group:'nogi',num:41,kind:'sel',
      title:'已開獎B',deadline:'',candidates:['池田瑛紗','賀喜遥香','遠藤さくら'],
      tally:{'池田瑛紗':9,'賀喜遥香':6,'遠藤さくら':3},voteCount:18,
      answer:'',closed:false,createdAt:2});
    await db.collection('polls').doc('nogi_60').set({group:'nogi',num:60,kind:'sel',
      title:'進行中',deadline:'',candidates:pollCandidates('nogi'),
      tally:{'小川彩':5},voteCount:5,answer:'',closed:false,createdAt:3});
  });
  await p.waitForTimeout(1200);
  const R=await p.evaluate(()=>({
    visible:visibleTallyPolls().map(x=>x.id).sort(),
    rank:voteRanking(),
    open60:pollOpen(pollData.find(x=>x.id==='nogi_60'))}));
  S.chk('進行中的預測是開著的', R.open60===true);
  S.chk('只統計看得到票數的預測',
        JSON.stringify(R.visible)==='["nogi_41","nogi_42"]', R.visible.join(','));
  S.chk('進行中又沒投的票沒有洩漏出去',
        !R.rank.some(x=>x.name==='小川彩'), R.rank.map(x=>x.name).join(','));
  S.chk('跨預測的票加總起來',
        R.rank[0].name==='賀喜遥香'&&R.rank[0].votes===13,
        R.rank[0].name+' '+R.rank[0].votes);
  S.chk('得票最多的不一定中選過', R.rank[0].hits===0, R.rank[0].hits);
  S.chk('中選次數算得對',
        R.rank.find(x=>x.name==='一ノ瀬美空').hits===1
        &&R.rank.find(x=>x.name==='池田瑛紗').hits===1);
  S.chk('照得票由高到低排',
        R.rank.every((x,i)=>i===0||x.votes<=R.rank[i-1].votes),
        R.rank.map(x=>x.votes).join(','));

  await p.evaluate(()=>buildPollList()); await p.waitForTimeout(400);
  S.chk('排行掛在預測面板裡', (await p.locator('#poll-list .pr-box').count())===1);
  S.chk('沒有動到原本的排行榜面板',
        (await p.locator('#rank-panel #rs-vote').count())===0);
  await p.evaluate(()=>document.querySelector('.pr-box').open=true);
  await p.waitForTimeout(300);
  const rows=await p.locator('.pr-row').count();
  S.chk('列出 5 位成員', rows===5, rows);
  S.chk('前三名有獎牌',
        (await p.locator('.pr-row .pr-pos').allTextContents()).slice(0,3).join('')==='🥇🥈🥉');
  S.chk('說明有講清楚統計範圍',
        (await p.locator('.pr-box .poll-note').textContent()).includes('還沒投'));

  // 投了那張進行中的之後，它才會被算進來
  await p.evaluate(async()=>{
    const inc=firebase.firestore.FieldValue.increment(1);
    const batch=db.batch();
    batch.set(db.collection('votes').doc('nogi_60_'+firebaseAuth.currentUser.uid),
      {pollId:'nogi_60',uid:firebaseAuth.currentUser.uid,pick:'小川彩',
       nick:'我',at:Date.now()});
    batch.update(db.collection('polls').doc('nogi_60'),
      new firebase.firestore.FieldPath('tally','小川彩'),inc,
      new firebase.firestore.FieldPath('voteCount'),inc);
    await batch.commit();
    myVotes['nogi_60']={pick:'小川彩',nick:'我'};
  });
  await p.waitForTimeout(900);
  const R2=await p.evaluate(()=>({
    visible:visibleTallyPolls().length,
    ogawa:voteRanking().find(x=>x.name==='小川彩')}));
  S.chk('自己投過之後，那張預測就算進來了', R2.visible===3, R2.visible);
  S.chk('自己投的那票也進了排行', R2.ogawa&&R2.ogawa.votes===6, JSON.stringify(R2.ogawa));

  // ── 不把暱稱當 HTML ──
  await p.evaluate(async()=>{
    await db.collection('polls').doc('nogi_45').set({
      group:'nogi',num:45,title:'<img src=x onerror="window.__pwned(1)">',
      deadline:'',candidates:['賀喜遥香'],
      tally:{'賀喜遥香':1},voteCount:1,answer:'',closed:true,createdAt:Date.now()});
  });
  await p.waitForTimeout(900);
  await p.evaluate(()=>buildPollList()); await p.waitForTimeout(400);
  S.chk('曲名當純文字顯示，沒有變成 img',
        (await p.locator('#poll-list img').count())===0);
  S.chk('注入字串看得到原文',
        (await p.locator('#poll-list').textContent()).includes('<img'));
  await p.close();

  // ── 訪客（沒登入）──
  p=await openPage(b,{auth:{signedOut:true},viewport:{width:900,height:1000},
                      onError:S.onError});
  await p.evaluate(async()=>{
    const batch=db.batch();
    ['nogi','hinata','sakura','keyaki','aoba'].forEach(g=>
      getBase(g).forEach(e=>batch.set(db.collection(g).doc(String(e.num)),toDoc({...e}))));
    await batch.commit();
  });
  await mkPoll(p,{num:46});
  await p.waitForTimeout(1200);
  const G=await p.evaluate(()=>({
    canEdit:canEdit(), guest:document.body.classList.contains('is-guest'),
    anonCalls:window.__anonCalls||0}));
  S.chk('訪客仍然不能編輯網站', !G.canEdit&&G.guest);
  S.chk('純瀏覽不會建立匿名帳號', G.anonCalls===0, G.anonCalls);

  await p.click('#poll-btn'); await p.waitForTimeout(600);
  S.chk('訪客看得到預測', (await p.locator('.poll-card').count())>0);
  S.chk('訪客看不到管理按鈕', (await p.locator('.poll-admin').count())===0);
  await p.fill('#poll-nick','路過的');
  await p.selectOption('#pv-sel-nogi_46','遠藤さくら'); await p.waitForTimeout(200);
  await p.click('.poll-pick .btn-save'); await p.waitForTimeout(1400);
  const GV=await p.evaluate(()=>({
    anonCalls:window.__anonCalls||0,
    vote:Object.values(window.__store.votes)[0],
    id:Object.keys(window.__store.votes)[0],
    tally:pollData.find(x=>x.id==='nogi_46').tally,
    bars:document.querySelectorAll('.pv-row').length}));
  S.chk('投票時才建立匿名帳號', GV.anonCalls===1, GV.anonCalls);
  S.chk('匿名的票寫得進去', GV.vote&&GV.vote.pick==='遠藤さくら', JSON.stringify(GV.vote));
  S.chk('匿名票的 id 用匿名 uid', /^nogi_46_anon-/.test(GV.id||''), GV.id);
  S.chk('匿名投票也會累加票數', GV.tally['遠藤さくら']===1, JSON.stringify(GV.tally));
  S.chk('訪客投完也看得到票數', GV.bars===1, GV.bars);
  S.chk('匿名身分不會讓登入按鈕以為已登入',
        (await p.locator('#auth-btn').textContent()).includes('登入'),
        await p.locator('#auth-btn').textContent());
  S.chk('匿名身分不會解鎖編輯權', await p.evaluate(()=>!canEdit()));

  await b.close();
  const r=S.report();
  process.exit(r.fail||r.errors?1:0);
})();
