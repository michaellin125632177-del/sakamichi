// 冷知識測驗與開盤台。
//
// ※ 測驗的分數是在瀏覽器算的，規則只保證「一天一次、一次最多 100」，
//   擋不住有人直接宣稱滿分。那是設計上已知的上限，不是這裡測得到的事。
const {launch,openPage,seed,suite,ADMIN_UID}=require('./lib');
const S=suite('冷知識測驗與開盤台');

(async()=>{
  const b=await launch();
  const p=await openPage(b,{auth:{uid:ADMIN_UID,name:'站長'},
                            viewport:{width:900,height:1000},onError:S.onError});
  await seed(p);
  await p.evaluate(async()=>{await ensureWallet('站長');});
  await p.waitForTimeout(800);

  // ── 出題 ──
  const Q=await p.evaluate(()=>{
    const runs=[];
    for(let i=0;i<12;i++){
      const qs=buildQuiz();
      runs.push({n:qs.length,
        four:qs.every(q=>q.options.length===4),
        hasAns:qs.every(q=>q.options.includes(q.answer)),
        uniqOpt:qs.every(q=>new Set(q.options).size===4),
        uniqQ:new Set(qs.map(x=>x.q)).size===qs.length,
        strs:qs.every(q=>typeof q.q==='string'&&q.q.length>4),
        ansStr:qs.every(q=>typeof q.answer==='string'&&q.answer.length>0)});
    }
    return {runs, sample:buildQuiz().map(q=>q.q)};
  });
  S.chk('每次都出得滿 10 題', Q.runs.every(r=>r.n===10), Q.runs.map(r=>r.n).join(','));
  S.chk('每題四個選項', Q.runs.every(r=>r.four));
  S.chk('正解一定在選項裡', Q.runs.every(r=>r.hasAns));
  S.chk('選項不重複（不會出現兩個一樣的）', Q.runs.every(r=>r.uniqOpt));
  S.chk('同一份考卷裡題目不重複', Q.runs.every(r=>r.uniqQ));
  S.chk('題目與答案都是有內容的字串',
        Q.runs.every(r=>r.strs&&r.ansStr));
  S.chk('題型有混到好幾種',
        new Set(Q.sample.map(t=>t.replace(/《[^》]*》|[^？]*是/g,''))).size>1,
        Q.sample.length);

  // ── 題型的內容 ──
  const K=await p.evaluate(()=>{
    const all=[];
    for(let i=0;i<40;i++)all.push(...buildQuiz());
    const has=re=>all.filter(q=>re.test(q.q));
    return {
      n:all.length,
      ansInOpts:all.every(q=>q.options.includes(q.answer)),
      centerQ:has(/的 center 是誰/).length,
      noTitle:all.filter(q=>/center/.test(q.q)&&!/《/.test(q.q)).length,
      numOnly:all.filter(q=>/第\d+張/.test(q.q)).length,
      zh:has(/中文譯名/).length,
      selCount:has(/選拔是幾人/).length,
      fukujin:has(/福神/).length,
      gen:has(/第幾期/).length,
      sameGen:has(/同期/).length,
      bday:has(/哪一年出生/).length,
      joined:has(/哪一年加入/).length,
      grad:has(/哪一年.*畢業/).length,
      tenure:has(/待得最久/).length,
      // 同期題的正解必須真的同期
      sameGenOk:(()=>{
        const qs=has(/同期/);
        return qs.every(q=>{
          const m=/跟 (.+?) 同期/.exec(q.q); if(!m)return false;
          return ALL_GROUPS.some(g=>{
            const all=getAllMembers(g);
            return all[m[1]]&&all[q.answer]&&
                   String(all[m[1]].gen)===String(all[q.answer].gen);});
        });})(),
      // 其他三個選項必須不同期
      sameGenDistract:(()=>{
        const qs=has(/同期/);
        return qs.every(q=>{
          const m=/跟 (.+?) 同期/.exec(q.q); if(!m)return false;
          return ALL_GROUPS.some(g=>{
            const all=getAllMembers(g); if(!all[m[1]])return false;
            return q.options.filter(o=>all[o]&&
              String(all[o].gen)===String(all[m[1]].gen)).length===1;});
        });})()
    };
  });
  S.chk('大量抽樣下正解都在選項裡（同期題曾經抽兩次抽到不同人）',
        K.ansInOpts, K.n+' 題');
  S.chk('拿掉了「第幾張單曲」', K.numOnly===0, K.numOnly);
  S.chk('拿掉了「中文譯名」', K.zh===0, K.zh);
  S.chk('拿掉了「選拔人數」', K.selCount===0, K.selCount);
  S.chk('拿掉了「福神人數」', K.fukujin===0, K.fukujin);
  S.chk('center 題一定列出日文曲名（只給編號猜不到）',
        K.centerQ>0&&K.noTitle===0, K.centerQ+' 題、沒曲名的 '+K.noTitle);
  [['期別',K.gen],['同期',K.sameGen],['生日年份',K.bday],
   ['入團年份',K.joined],['畢業年份',K.grad],['在籍最久',K.tenure]]
    .forEach(([n,v])=>S.chk('出得到「'+n+'」題', v>0, v));
  S.chk('同期題的正解真的同期', K.sameGenOk);
  S.chk('同期題的干擾選項都不同期', K.sameGenDistract);

  // ── 出身地與身高（資料來自現役成員名冊）──
  const H=await p.evaluate(()=>{
    const all=[];
    for(let i=0;i<40;i++)all.push(...buildQuiz());
    const home=all.filter(q=>/的出身地是哪裡/.test(q.q));
    const tall=all.filter(q=>/身高最高/.test(q.q));
    const look=n=>{let r=null;ALL_GROUPS.forEach(g=>{
      const a=getAllMembers(g); if(a[n]&&(a[n].home||a[n].ht))r=a[n];});return r;};
    let withHome=0,withHt=0;
    ALL_GROUPS.forEach(g=>Object.values(getAllMembers(g)).forEach(m=>{
      if(m.home)withHome++; if(m.ht)withHt++;}));
    return {
      homeN:home.length, tallN:tall.length, withHome, withHt,
      // 出身地：正解要真的是那個人的出身地
      homeOk:home.every(q=>{
        const m=/^(.+?) 的出身地/.exec(q.q); if(!m)return false;
        const info=look(m[1]); return info&&info.home===q.answer;}),
      homeUniq:home.every(q=>new Set(q.options).size===4),
      // 身高：正解要真的最高，而且跟第二名差距夠大
      tallOk:tall.every(q=>{
        const hs=q.options.map(n=>(look(n)||{}).ht);
        if(hs.some(h=>!h))return false;
        return (look(q.answer)||{}).ht===Math.max(...hs);}),
      tallGap:tall.every(q=>{
        const hs=q.options.map(n=>(look(n)||{}).ht).sort((a,b)=>b-a);
        return hs[0]-hs[1]>=2;}),
      // 沒有這筆資料的人不該被抽出來當題目
      tallAllHave:tall.every(q=>q.options.every(n=>(look(n)||{}).ht))
    };
  });
  S.chk('名冊裡有出身地的成員', H.withHome>=99, H.withHome+' 人');
  S.chk('名冊裡有身高的成員', H.withHt>=99, H.withHt+' 人');
  S.chk('出得到「出身地」題', H.homeN>0, H.homeN);
  S.chk('出身地的正解跟名冊一致', H.homeOk);
  S.chk('出身地的四個選項不重複', H.homeUniq);
  S.chk('出得到「誰最高」題', H.tallN>0, H.tallN);
  S.chk('最高的那個人真的最高', H.tallOk);
  S.chk('最高的跟第二名至少差 2cm（不然等於擲骰子）', H.tallGap);
  S.chk('沒登記身高的人不會被抽進選項', H.tallAllHave);

  // ── 答題與獎金 ──
  await p.click('#poll-btn'); await p.waitForTimeout(500);
  await p.evaluate(()=>setPollTab('quiz')); await p.waitForTimeout(400);
  S.chk('面板有測驗分頁', (await p.locator('.pt-tab').count())===2);
  S.chk('測驗分頁是選取狀態',
        (await p.locator('.pt-tab.active').textContent()).includes('測驗'));
  await p.evaluate(()=>startQuiz()); await p.waitForTimeout(500);
  S.chk('畫面上出現 10 題', (await p.locator('.qz-q').count())===10,
        await p.locator('.qz-q').count());
  S.chk('每題四顆按鈕', (await p.locator('.qz-opt').count())===40,
        await p.locator('.qz-opt').count());

  // 答對 7 題、答錯 3 題
  const R7=await p.evaluate(async()=>{
    const before=myWallet.balance;
    quizState.qs.forEach((q,i)=>{
      answerQuiz(i, i<7?q.answer:q.options.find(o=>o!==q.answer));
    });
    await new Promise(r=>setTimeout(r,900));
    return {before,score:quizState.score,after:myWallet.balance,
            day:myWallet.quizDay,gain:myWallet.quizGain,done:quizState.done};
  });
  S.chk('答對 7 題就是 7 分', R7.score===7, R7.score);
  S.chk('一題 10 坂幣，7 題拿 70', R7.after-R7.before===70, R7.after-R7.before);
  S.chk('記下領取日', /^\d{4}-\d{2}-\d{2}$/.test(R7.day||''), R7.day);
  S.chk('記下這次領多少', R7.gain===70, R7.gain);
  S.chk('答完自動結束', R7.done===true);
  S.chk('答錯的標紅、正解標綠',
        (await p.locator('.qz-opt.is-wrong').count())===3
        &&(await p.locator('.qz-opt.is-right').count())===10,
        (await p.locator('.qz-opt.is-wrong').count())+'/'+
        (await p.locator('.qz-opt.is-right').count()));
  S.chk('看得到分數', (await p.locator('.qz-score').textContent()).includes('7 / 10'),
        await p.locator('.qz-score').textContent());

  // 同一天再玩不再給錢
  const R2=await p.evaluate(async()=>{
    const before=myWallet.balance;
    startQuiz();
    quizState.qs.forEach((q,i)=>answerQuiz(i,q.answer));
    await new Promise(r=>setTimeout(r,900));
    return {before,after:myWallet.balance,score:quizState.score};
  });
  S.chk('同一天再玩還是算得出分數', R2.score===10, R2.score);
  S.chk('但不會再給錢（一天一次）', R2.after===R2.before, R2.before+' → '+R2.after);
  S.chk('有說明今天已經領過',
        (await p.locator('.qz-done').first().textContent()).includes('不計獎金'),
        await p.locator('.qz-done').first().textContent());
  // 一題只能答一次
  const once=await p.evaluate(()=>{
    startQuiz();
    const q=quizState.qs[0];
    const wrong=q.options.find(o=>o!==q.answer);
    answerQuiz(0,wrong); answerQuiz(0,q.answer);
    return quizState.answers[0]===wrong;
  });
  S.chk('一題只能答一次，不能改', once);
  await p.evaluate(()=>{quizState=null;setPollTab('bet');});
  await p.waitForTimeout(400);

  // ── 盤口種類 ──
  const T=await p.evaluate(()=>{
    const d=getData('nogi').find(x=>x.num===42);
    const out={};
    Object.keys(BET_TYPES).forEach(k=>{
      const subj=BET_TYPES[k].need==='member'?'賀喜遥香':'';
      out[k]={label:BET_TYPES[k].label('nogi',{subject:subj}),
              cands:pollCandsFor('nogi',k,subj).length,
              ans:(BET_TYPES[k].answer('nogi',d,{subject:subj})||[]).join('、')};
    });
    return {out, sel:selCountOf(d), fuk:(d.fukujin||[]).length,
      legacySel:pollType({kind:'sel'}), legacyUnder:pollType({kind:'under'}),
      legacyNone:pollType({num:1}),
      absent:BET_TYPES.member.answer('nogi',d,{subject:'白石麻衣'}).join('')};
  });
  S.chk('五種盤口都在', Object.keys(T.out).length===5, Object.keys(T.out).join(','));
  S.chk('表題 C 對得出答案', T.out.center.ans==='一ノ瀬美空', T.out.center.ans);
  S.chk('Under C 對得出答案', !!T.out.undercenter.ans, T.out.undercenter.ans);
  S.chk('選拔人數對得上站位', T.out.count.ans===T.sel+'名',
        T.out.count.ans+' vs '+T.sel);
  S.chk('福神人數對得上名單', T.out.fukujin.ans===T.fuk+'名',
        T.out.fukujin.ans+' vs '+T.fuk);
  S.chk('某人進不進選拔：有進', T.out.member.ans==='會進選拔', T.out.member.ans);
  S.chk('某人進不進選拔：沒進', T.absent==='不會進選拔', T.absent);
  S.chk('是非題只有兩個選項', T.out.member.cands===2, T.out.member.cands);
  S.chk('人數題給的是合理範圍', T.out.count.cands>5&&T.out.count.cands<30, T.out.count.cands);
  S.chk('舊的 kind:sel 當成表題 C', T.legacySel==='center', T.legacySel);
  S.chk('舊的 kind:under 當成 Under C', T.legacyUnder==='undercenter', T.legacyUnder);
  S.chk('沒有 kind 的舊資料當成表題 C', T.legacyNone==='center', T.legacyNone);

  // ── 開盤台 ──
  // 每一項都把表單重開一次，免得前一項留下的狀態影響後面
  const freshForm=async(type,subject)=>p.evaluate(([t,subj])=>{
    newPollOpen=true; buildPollList();
    const sels=document.querySelectorAll('.np-box select');
    if(t){sels[1].value=t; sels[1].onchange();}
    if(subj){sels[2].value=subj; sels[2].onchange();}
    const row=document.querySelector('.np-member');
    const btn=document.querySelector('.np-box .btn-save');
    return {selects:sels.length, types:sels[1].options.length,
            memberRow:row?row.style.display:'(找不到)',
            prev:document.querySelector('.np-prev').textContent,
            btn:btn.textContent, disabled:btn.disabled};
  },[type,subject]);

  let F=await freshForm();
  S.chk('開盤台打得開', (await p.locator('.np-box').count())===1);
  S.chk('三個下拉：團體、盤口、成員', F.selects===3, F.selects);
  S.chk('盤口種類有五種', F.types===5, F.types);
  S.chk('預設不顯示「指定成員」那一列', F.memberRow==='none', F.memberRow);
  S.chk('預設是表題 C，候選是成員',
        /候選 \d\d 項/.test(F.prev), F.prev.slice(0,24));
  S.chk('再按一次會收起來', await p.evaluate(()=>{
    openNewPoll(); return !document.querySelector('.np-box');}));

  F=await freshForm('member');
  S.chk('選了「某人進不進選拔」才顯示指定成員', F.memberRow==='', F.memberRow);
  S.chk('候選跟著變成兩項', F.prev.includes('候選 2 項'), F.prev);
  S.chk('開盤鈕是可以按的', F.disabled===false, F.btn+' disabled='+F.disabled);

  F=await freshForm('count');
  S.chk('選人數題時不顯示指定成員', F.memberRow==='none', F.memberRow);
  S.chk('人數題的候選是數字', /\d+名/.test(F.prev), F.prev.slice(0,30));

  // 實際開一個是非盤
  await freshForm('member');
  const made=await p.evaluate(async()=>{
    const before=pollData.length;
    document.querySelector('.np-box .btn-save').click();
    await new Promise(r=>setTimeout(r,1600));
    const np=pollData.find(x=>x.type==='member');
    return {grew:pollData.length===before+1,
            type:np&&np.type, subject:np&&np.subject,
            label:np?pollKindLabel(np):null,
            cands:np?np.candidates:null,
            pool:np&&np.pool, settled:np&&np.settled};
  });
  S.chk('開得出盤', made.grew&&made.type==='member',
        made.grew+'/'+made.type);
  S.chk('存下指定的成員', !!made.subject, made.subject);
  S.chk('標題講得出賭什麼', /進不進選拔/.test(made.label||''), made.label);
  S.chk('候選就是會／不會',
        JSON.stringify(made.cands)==='["會進選拔","不會進選拔"]',
        JSON.stringify(made.cands));
  S.chk('新盤的彩池從 0 開始', made.pool===0&&made.settled===false,
        made.pool+'/'+made.settled);

  const dup=await freshForm('member',made.subject);
  S.chk('同一個盤口不能開第二次', /已經開過/.test(dup.btn), dup.btn);
  S.chk('重複時按鈕是鎖住的', dup.disabled===true, dup.disabled);

  await b.close();
  const r=S.report();
  process.exit(r.fail||r.errors?1:0);
})();
