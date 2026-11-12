// C 位預測：候選名單、匿名投票、票數累加、投完才看得到票數、開獎。
//
// ※ 這裡測的是前端那一半。Firestore 規則（firestore.rules）擋不擋得住
//   惡意寫入，假的 Firebase 沒有規則引擎，測不到——那只能在線上驗。
const {launch,openPage,seed,suite,ADMIN_UID}=require('./lib');
const S=suite('C 位預測');

// 文件 id 現在每次建立都不一樣，所以一律回傳實際的 id 給測試用
const mkPoll=(p,o={})=>p.evaluate(async o=>{
  const g=o.g||'nogi', kind=o.kind||'sel', id=pollId(g,o.num||44,kind);
  await db.collection('polls').doc(id).set({
    group:g,num:o.num||44,kind,title:o.title||'テスト曲',
    deadline:o.deadline||'',candidates:o.cands||pollCandidates(g),
    tally:o.tally||{},voteCount:o.voteCount||0,answer:o.answer||'',
    closed:!!o.closed,createdAt:Date.now()});
  return id;
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
  const P44=await mkPoll(p,{num:44});
  await p.waitForTimeout(900);
  S.chk('按鈕顯示進行中的預測數',
        (await p.locator('#poll-btn').textContent()).includes('1'),
        await p.locator('#poll-btn').textContent());
  await p.click('#poll-btn'); await p.waitForTimeout(600);
  S.chk('視窗打得開', (await p.locator('#pollModal.open').count())===1);
  S.chk('投票前看不到票數', (await p.locator('.pv').count())===0);
  S.chk('投票前有候選下拉', (await p.locator('#pv-sel-'+P44).count())===1);
  const PH=await p.evaluate(id=>{
    const o=document.querySelector('#pv-sel-'+id+' option');
    return {hidden:o.hidden,disabled:o.disabled,value:o.value,
            selected:document.querySelector('#pv-sel-'+id).value};
  },P44);
  S.chk('提示選項不出現在展開的清單裡', PH.hidden===true);
  S.chk('提示選項選不到', PH.disabled===true);
  S.chk('一開始沒有預設選中任何成員（免得手滑送出不能改的票）',
        PH.selected==='', JSON.stringify(PH.selected));
  S.chk('沒選人時送出鈕是關的',
        await p.evaluate(()=>document.querySelector('.poll-pick .btn-save').disabled));
  S.chk('下拉不含已畢業成員',
        !(await p.locator('#pv-sel-'+P44).allTextContents())[0].includes('白石麻衣'));

  await p.fill('#poll-nick','坂道老司機');
  await p.selectOption('#pv-sel-'+P44,'賀喜遥香'); await p.waitForTimeout(200);
  await p.click('.poll-pick .btn-save'); await p.waitForTimeout(1200);

  const V=await p.evaluate(id=>{
    const pl=pollData.find(x=>x.id===id);
    const v=Object.values(window.__store.votes)[0];
    return {tally:pl.tally,voteCount:pl.voteCount,vote:v,
            voteDocId:Object.keys(window.__store.votes)[0],
            bars:document.querySelectorAll('.pv-row').length,
            stillPicker:document.querySelectorAll('#pv-sel-'+id).length,
            nickSaved:localStorage.getItem('sakamichi-nick')};
  },P44);
  S.chk('票數累加到 1', V.tally['賀喜遥香']===1&&V.voteCount===1, JSON.stringify(V.tally));
  S.chk('票有寫進去', V.vote&&V.vote.pick==='賀喜遥香', JSON.stringify(V.vote));
  S.chk('票帶著暱稱', V.vote&&V.vote.nick==='坂道老司機', V.vote&&V.vote.nick);
  S.chk('票的 id 是 預測_uid（所以一人只佔得到一格）',
        V.voteDocId===P44+'_'+ADMIN_UID, V.voteDocId);
  S.chk('投完看得到票數', V.bars===1, V.bars);
  S.chk('投完就不能再投', V.stillPicker===0, V.stillPicker);
  S.chk('暱稱記在這台裝置上', V.nickSaved==='坂道老司機', V.nickSaved);

  // 第二票投別人，票數要分開累加
  await p.evaluate(async id=>{
    const inc=firebase.firestore.FieldValue.increment(1);
    const batch=db.batch();
    batch.set(db.collection('votes').doc(id+'_someone'),
      {pollId:id,uid:'someone',pick:'井上和',nick:'路人',at:Date.now()});
    batch.update(db.collection('polls').doc(id),
      new firebase.firestore.FieldPath('tally','井上和'),inc,
      new firebase.firestore.FieldPath('voteCount'),inc);
    await batch.commit();
  },P44);
  await p.waitForTimeout(900);
  const V2=await p.evaluate(id=>{
    const pl=pollData.find(x=>x.id===id);
    return {tally:pl.tally,voteCount:pl.voteCount,
            bars:[...document.querySelectorAll('.pv-row')]
              .map(r=>r.querySelector('.pv-name').textContent.trim())};
  },P44);
  S.chk('兩個人的票分開累加',
        V2.tally['賀喜遥香']===1&&V2.tally['井上和']===1&&V2.voteCount===2,
        JSON.stringify(V2.tally));
  S.chk('自己投的那個有星號', V2.bars.some(t=>t.startsWith('★')), V2.bars.join(' / '));

  // ── 開獎：單曲建好之後自動對答案 ──
  const A=await p.evaluate(async id=>{
    const before=pollAnswer(pollData.find(x=>x.id===id));
    await db.collection('nogi').doc('44').set(toDoc({
      num:44,title:'テスト曲',zh:'測試',date:'2027年1月1日',total:3,
      center:['賀喜遥香'],rows:[[],[],['賀喜遥香','井上和','遠藤さくら']]}));
    return {before};
  },P44);
  await p.waitForTimeout(1200);
  const A2=await p.evaluate(id=>{
    const pl=pollData.find(x=>x.id===id);
    return {answer:pollAnswer(pl),open:pollOpen(pl)};
  },P44);
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
    selKey:pollKey('nogi',50,'sel'), underKey:pollKey('nogi',50,'under'),
    twice:[pollId('nogi',50,'sel'),pollId('nogi',50,'sel')],
    keyOfLegacy:pollKeyOf({group:'nogi',num:50}),
    selKind:pollKind({kind:'sel'}), underKind:pollKind({kind:'under'}),
    legacy:pollKind({num:1}),
    selLabel:pollKindLabel({group:'nogi',kind:'sel'}),
    underNogi:pollKindLabel({group:'nogi',kind:'under'}),
    underHinata:pollKindLabel({group:'hinata',kind:'under'}),
    underSakura:pollKindLabel({group:'sakura',kind:'under'})
  }));
  S.chk('表題與 Under 的 id 不一樣（同一張才能各開一個）',
        K.selId!==K.underId, K.selId+' vs '+K.underId);
  S.chk('表題與 Under 的唯一鍵不一樣', K.selKey!==K.underKey,
        K.selKey+' vs '+K.underKey);
  S.chk('同一個預測建兩次，id 不會一樣（刪掉重開才不會繼承舊狀態）',
        K.twice[0]!==K.twice[1]||K.twice[0].length>K.selKey.length,
        K.twice.join(' / '));
  S.chk('沒有 kind 的舊預測，唯一鍵算成表題',
        K.keyOfLegacy===K.selKey, K.keyOfLegacy);
  S.chk('沒有 kind 的舊預測當成表題曲', K.legacy==='sel', K.legacy);
  S.chk('表題曲的標籤', K.selLabel==='表題曲', K.selLabel);
  S.chk('乃木坂的 Under 叫 under 曲', K.underNogi==='under 曲', K.underNogi);
  S.chk('日向坂的 Under 叫ひなた坂', K.underHinata==='ひなた坂 曲', K.underHinata);
  S.chk('櫻坂的 Under 叫 BACKS', K.underSakura==='BACKS 曲', K.underSakura);

  const P50=await mkPoll(p,{num:50,kind:'sel',title:'表題テスト'});
  const P50U=await mkPoll(p,{num:50,kind:'under',title:'アンダーテスト'});
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
  const UA2=await p.evaluate(ids=>({
    sel:pollAnswer(pollData.find(x=>x.id===ids[0])),
    under:pollAnswer(pollData.find(x=>x.id===ids[1]))}),[P50,P50U]);
  S.chk('表題的答案是單曲的 center', UA2.sel==='井上和', UA2.sel);
  S.chk('Under 的答案取 under 站位的正中央，不是 center',
        UA2.under==='伊藤理々杏', UA2.under);

  // ── 歷來預測結果 ──
  await p.evaluate(async()=>{
    for(const id of Object.keys(window.__store.polls))
      await db.collection('polls').doc(id).delete();
    myVotes={}; localStorage.removeItem('sakamichi-votes');
    const mk=async(num,tally,count,title)=>{
      const id=pollId('nogi',num,'sel');
      await db.collection('polls').doc(id).set({group:'nogi',num,kind:'sel',title,
        deadline:'',candidates:pollCandidates('nogi'),tally,voteCount:count,
        answer:'',closed:false,createdAt:num});
      return id;
    };
    // 答案都是從既有單曲的 center 自動對上的
    window.__H42=await mk(42,{'一ノ瀬美空':12,'賀喜遥香':7,'井上和':4},23,'A'); // 大家中
    window.__H41=await mk(41,{'賀喜遥香':11,'池田瑛紗':6,'遠藤さくら':3},20,'B'); // 大家沒中
    window.__H40=await mk(40,{'瀬戸口心月':8,'賀喜遥香':5},13,'C');              // W-center 中其一
    window.__H90=await mk(90,{},0,'進行中');   // 90 沒有對應單曲，不會自動開獎
    myVotes[window.__H41]={pick:'池田瑛紗',nick:'我'};   // 我在 41 猜中
  });
  await p.waitForTimeout(1300);

  const HS=await p.evaluate(()=>({
    hist:pollHistory().map(x=>x.num),
    stat:historyStats(),
    c42:crowdPick(pollData.find(x=>x.id===window.__H42)),
    c41:crowdPick(pollData.find(x=>x.id===window.__H41)),
    a40:pollAnswer(pollData.find(x=>x.id===window.__H40)),
    tie:crowdPick({tally:{'甲':5,'乙':5,'丙':2},voteCount:12}),
    none:crowdPick({tally:{},voteCount:0})
  }));
  S.chk('歷來只收已開獎／已截止的',
        JSON.stringify(HS.hist)==='[42,41,40]', HS.hist.join(','));
  S.chk('進行中的不列進歷來', !HS.hist.includes(90), HS.hist.join(','));
  S.chk('群眾最看好的是得票第一',
        HS.c42.names[0]==='一ノ瀬美空'&&HS.c42.n===12, JSON.stringify(HS.c42));
  S.chk('算得出得票率', HS.c42.pct===52, HS.c42.pct);
  S.chk('同票的都算進群眾首選',
        HS.tie.names.length===2&&HS.tie.names.includes('甲')&&HS.tie.names.includes('乙'),
        JSON.stringify(HS.tie));
  S.chk('沒人投票時沒有群眾首選', HS.none===null);
  S.chk('開獎 3 次', HS.stat.done===3, HS.stat.done);
  S.chk('大家猜中 2 次（41 那次最高票不是答案）',
        HS.stat.crowdHit===2, HS.stat.crowdHit);
  S.chk('W-center 只要中其一就算中', HS.a40.includes('、')&&HS.stat.crowdHit===2, HS.a40);
  S.chk('自己的戰績分開算', HS.stat.mine===1&&HS.stat.myHit===1,
        HS.stat.myHit+'/'+HS.stat.mine);

  const HB=await p.evaluate(()=>({
    hit:hitBy('甲、乙',['乙']), miss:hitBy('甲、乙',['丙']),
    noAns:hitBy(null,['甲']), noPick:hitBy('甲',[])}));
  S.chk('命中判定：答案含其中一個就算中', HB.hit===true);
  S.chk('命中判定：都不在就是沒中', HB.miss===false);
  S.chk('命中判定：沒答案不算中', HB.noAns===false);
  S.chk('命中判定：沒投不算中', HB.noPick===false);

  await p.evaluate(()=>buildPollList()); await p.waitForTimeout(400);
  S.chk('歷來面板掛在預測面板裡', (await p.locator('#poll-list .ph-box').count())===1);
  S.chk('上面只留進行中的卡片',
        (await p.locator('#poll-list>.poll-card').count())===1,
        await p.locator('#poll-list>.poll-card').count());
  S.chk('已開獎的不會在上面重複出現一次',
        !(await p.locator('#poll-list>.poll-card').textContent()).includes('已開獎'));
  await p.evaluate(()=>document.querySelector('.ph-box').open=true);
  await p.waitForTimeout(300);
  S.chk('歷來列出 3 筆', (await p.locator('.ph-row').count())===3,
        await p.locator('.ph-row').count());
  const stat=await p.locator('.ph-stat').textContent();
  S.chk('統計列有命中率', stat.includes('67%'), stat);
  S.chk('統計列有自己的戰績', stat.includes('1 / 1'), stat);
  const marks=await p.locator('.ph-mark').allTextContents();
  S.chk('命中與落空分開標示',
        marks.filter(t=>t.includes('命中')).length===2
        &&marks.filter(t=>t.includes('落空')).length===1, marks.join(' '));
  S.chk('有投過的那筆標出自己投誰',
        (await p.locator('.ph-mine').count())===1);
  await p.evaluate(()=>document.querySelectorAll('.ph-row').forEach(r=>r.open=true));
  await p.waitForTimeout(300);
  S.chk('展開看得到完整票數', (await p.locator('.ph-row .pv-row').count())>0,
        await p.locator('.ph-row .pv-row').count());

  S.chk('舊的得票排行已經移除', await p.evaluate(()=>
    typeof voteRanking==='undefined'&&!document.querySelector('.pr-box')));

  // ── 刪掉再重開同一個預測（回歸）──
  // 舊版的文件 id 固定是 {團}_{編號}，刪掉重開會沿用同一個 id，於是
  // 新預測繼承了舊預測的狀態：畫面顯示「你投過了」其實沒投，而且
  // 伺服器那邊舊的票還佔著 {id}_{uid} 擋住新的票。
  await p.evaluate(async()=>{
    for(const id of Object.keys(window.__store.polls))
      await db.collection('polls').doc(id).delete();
    myVotes={}; localStorage.removeItem('sakamichi-votes');
  });
  await p.waitForTimeout(600);
  const D1=await mkPoll(p,{num:70,title:'第一次'});
  await p.waitForTimeout(800);
  await p.evaluate(async id=>{await castVote(id,'小川彩','我');},D1);
  await p.waitForTimeout(800);
  S.chk('投完之後本機記著這一票', await p.evaluate(id=>!!myVoteOn(id),D1));
  await p.evaluate(async id=>{await db.collection('polls').doc(id).delete();},D1);
  await p.waitForTimeout(800);
  const D2=await mkPoll(p,{num:70,title:'重開的'});
  await p.waitForTimeout(1000);

  S.chk('刪掉重開會拿到不一樣的 id', D1!==D2, D1+' → '+D2);
  S.chk('舊的那筆記錄被清掉了', await p.evaluate(id=>!myVoteOn(id),D1));
  S.chk('新預測不會被誤認為投過', await p.evaluate(id=>!myVoteOn(id),D2));
  await p.evaluate(()=>buildPollList()); await p.waitForTimeout(400);
  S.chk('新預測看得到投票下拉', (await p.locator('#pv-sel-'+D2).count())===1);
  S.chk('畫面沒有誤顯示「你投了」',
        !(await p.locator('#poll-list').textContent()).includes('你投了'));
  S.chk('舊的票不會佔住新預測的票位',
        await p.evaluate(ids=>!window.__store.votes[ids[1]+'_'+
          firebaseAuth.currentUser.uid],[D1,D2]));
  // 新預測投得下去
  await p.selectOption('#pv-sel-'+D2,'賀喜遥香'); await p.waitForTimeout(200);
  await p.click('.poll-pick .btn-save'); await p.waitForTimeout(1200);
  S.chk('重開之後投得下去',
        await p.evaluate(id=>(pollData.find(x=>x.id===id).tally||{})['賀喜遥香']===1,D2));

  // ── 本機記錄跟雲端對不上時會自我修復 ──
  // 使用者現有的壞掉狀態就是這樣：預測還在、票數是空的，但本機記著投過。
  const H=await mkPoll(p,{num:71,title:'票數是空的'});
  await p.evaluate(id=>{
    myVotes[id]={pick:'小川彩',nick:'我'};
    localStorage.setItem('sakamichi-votes',JSON.stringify(myVotes));
  },H);
  S.chk('先造出對不上的狀態', await p.evaluate(id=>!!myVoteOn(id),H));
  await p.evaluate(()=>reconcileMyVotes());
  S.chk('票數是空的就代表沒投過，記錄被丟掉',
        await p.evaluate(id=>!myVoteOn(id),H));
  // 反面：票數對得上就不能亂丟
  const H2=await mkPoll(p,{num:72,title:'真的投過',tally:{'賀喜遥香':3},voteCount:3});
  await p.waitForTimeout(800);
  await p.evaluate(id=>{myVotes[id]={pick:'賀喜遥香',nick:'我'};},H2);
  await p.evaluate(()=>reconcileMyVotes());
  S.chk('票數對得上的記錄要保留', await p.evaluate(id=>!!myVoteOn(id),H2));

  // ── 不把暱稱當 HTML ──
  await p.evaluate(async()=>{
    await db.collection('polls').doc(pollId('nogi',45,'sel')).set({
      group:'nogi',num:45,title:'<img src=x onerror="window.__pwned(1)">',
      deadline:'',candidates:['賀喜遥香'],
      tally:{'賀喜遥香':1},voteCount:1,answer:'',closed:true,createdAt:Date.now()});
  });
  await p.waitForTimeout(900);
  await p.evaluate(()=>buildPollList()); await p.waitForTimeout(400);
  await p.evaluate(()=>{document.querySelector('.ph-box').open=true;});
  await p.waitForTimeout(300);
  S.chk('曲名當純文字顯示，沒有變成 img',
        (await p.locator('#poll-list img').count())===0);
  S.chk('注入字串看得到原文（歷來區也一樣）',
        (await p.locator('#poll-list').textContent()).includes('<img'),
        (await p.locator('.ph-song').first().textContent()));
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
  const P46=await mkPoll(p,{num:46});
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
  await p.selectOption('#pv-sel-'+P46,'遠藤さくら'); await p.waitForTimeout(200);
  await p.click('.poll-pick .btn-save'); await p.waitForTimeout(1400);
  const GV=await p.evaluate(()=>({
    anonCalls:window.__anonCalls||0,
    vote:Object.values(window.__store.votes)[0],
    id:Object.keys(window.__store.votes)[0],
    tally:pollData.find(x=>x.num===46).tally,
    bars:document.querySelectorAll('.pv-row').length}));
  S.chk('投票時才建立匿名帳號', GV.anonCalls===1, GV.anonCalls);
  S.chk('匿名的票寫得進去', GV.vote&&GV.vote.pick==='遠藤さくら', JSON.stringify(GV.vote));
  S.chk('匿名票的 id 用匿名 uid', /_anon-/.test(GV.id||''), GV.id);
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
