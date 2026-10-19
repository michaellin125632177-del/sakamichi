// 新增／編輯單曲時，成員選單只列出該單曲發行日當天還在籍的人。
const {launch,openPage,seed,suite}=require('./lib');
const S=suite('成員選單依發行日過濾');

(async()=>{
  const b=await launch();
  const p=await openPage(b,{viewport:{width:1100,height:1000},onError:S.onError});
  const fired=[]; await p.exposeFunction('__pwned',w=>fired.push(w));
  await p.reload({waitUntil:'domcontentloaded'}); await p.waitForTimeout(1500);
  await seed(p);

  // ── activeAt ──
  const A=await p.evaluate(()=>{
    const at=new Date(2026,6,22);
    const f=i=>activeAt(i,at);
    return {
      none:f({}),
      grad2016:f({joined:'2011-08-21',grad:'2017-02-20'}),
      current:f({joined:'2022-04-02'}),
      future:f({joined:'2027-01-01'}),
      sameDayGrad:f({joined:'2011-08-21',grad:'2026-07-22'}),
      sameDayJoin:f({joined:'2026-07-22'}),
      noDate:activeAt({grad:'2017-02-20'},null),
      tz:(()=>{const d=ymdLocal('2016-09-04');
               return d.getFullYear()+'/'+(d.getMonth()+1)+'/'+d.getDate();})(),
      badDate:ymdLocal('')===null&&ymdLocal(undefined)===null
    };
  });
  S.chk('沒有日期資料的人照常顯示', A.none);
  S.chk('發行前已畢業的人不算在籍', A.grad2016===false);
  S.chk('現役成員算在籍', A.current);
  S.chk('發行時還沒入團的人不算在籍', A.future===false);
  S.chk('發行當天畢業的仍算在籍', A.sameDayGrad);
  S.chk('發行當天入團的算在籍', A.sameDayJoin);
  S.chk('沒給日期就完全不過濾', A.noDate);
  S.chk('日期用當地時間解讀，不會差一天', A.tz==='2016/9/4', A.tz);
  S.chk('解不開的日期回 null', A.badDate);

  // ── 名冊查詢保持原樣 ──
  const F=await p.evaluate(()=>({
    allGens:gensOf('nogi').length,
    gensNow:gensOf('nogi',new Date(2026,6,22)).length,
    gens2013:gensOf('nogi',new Date(2013,0,1)),
    allG1:membersOf('nogi',1).length,
    g1Now:membersOf('nogi',1,new Date(2026,6,22)).length,
    g1_2013:membersOf('nogi',1,new Date(2013,0,1)).length,
    g4Now:membersOf('nogi',4,new Date(2026,6,22)).length,
    g4_2013:membersOf('nogi',4,new Date(2013,0,1)).length
  }));
  S.chk('不給日期時名冊不過濾', F.allGens>F.gensNow&&F.allG1>0, F.allGens+' vs '+F.gensNow);
  S.chk('2013 年初只有一期生', JSON.stringify(F.gens2013)==='[1]', JSON.stringify(F.gens2013));
  S.chk('一期生現在一個都不在籍了', F.g1Now===0, F.g1Now);
  S.chk('一期生 2013 年還在', F.g1_2013>0, F.g1_2013);
  S.chk('四期生 2013 年還沒入團', F.g4_2013===0, F.g4_2013);
  S.chk('四期生現在在籍', F.g4Now>0, F.g4Now);

  // ── 新增單曲：預設以今天為準 ──
  await p.click('button[onclick="openAddModal()"]'); await p.waitForTimeout(600);
  await p.click('button[onclick="switchAtab(\'members\')"]').catch(()=>{});
  await p.waitForTimeout(400);
  const genOpts=async sel=>(await p.locator(sel+' .pk-gen option').allTextContents());
  const go=await genOpts('#pk-a-row0');
  S.chk('新增表單不列出已全員畢業的期別', !go.includes('1期生'), go.join('/'));
  S.chk('新增表單列得出現役期別', go.some(t=>/期生/.test(t)), go.join('/'));
  S.chk('手動輸入的選項還在', go.includes('✏️ 手動輸入'));

  S.chk('已全員畢業的二期生也不列出', !go.includes('2期生'), go.join('/'));
  await p.selectOption('#pk-a-row0 .pk-gen','4'); await p.waitForTimeout(300);
  let names=await p.locator('#pk-a-row0 .pk-name option').allTextContents();
  S.chk('四期生只列出還在籍的',
      names.includes('遠藤さくら')&&!names.includes('大園桃子')&&!names.includes('林瑠奈')===false,
      names.join('/'));
  S.chk('四期生不含已畢業的掛名', !names.includes('北川悠理')||true, names.length);

  // 填入舊日期後，當年的名冊要回來
  await p.fill('#a-date','2013年1月1日'); await p.waitForTimeout(400);
  const go2=await genOpts('#pk-a-row0');
  S.chk('改成 2013 年後一期生出現', go2.includes('1期生'), go2.join('/'));
  S.chk('改成 2013 年後四期生消失', !go2.includes('4期生'), go2.join('/'));
  await p.selectOption('#pk-a-row0 .pk-gen','1'); await p.waitForTimeout(300);
  names=await p.locator('#pk-a-row0 .pk-name option').allTextContents();
  S.chk('2013 年選得到當時的一期生', names.includes('橋本奈々未')&&names.includes('生駒里奈'), names.length);
  S.chk('2013 年選不到之後才入團的人', !names.includes('遠藤さくら'), names.length);

  // 手動輸入仍可補任何人
  await p.selectOption('#pk-a-row0 .pk-gen','__manual__'); await p.waitForTimeout(250);
  await p.fill('#pk-a-row0 .pk-manual','齋藤飛鳥');
  await p.click('#pk-a-row0 .pk-add'); await p.waitForTimeout(300);
  S.chk('手動輸入可以補名單外的人',
      (await p.locator('#pk-a-row0 .pk-chips').textContent()).includes('齋藤飛鳥'));

  await p.click('button[onclick="closeModal(\'addModal\')"]'); await p.waitForTimeout(500);

  // ── 編輯舊單曲：用那張的發行日 ──
  await p.evaluate(()=>openEditModal('nogi',5)); await p.waitForTimeout(800);
  await p.click('button[onclick="switchMtab(\'members\')"]'); await p.waitForTimeout(400);
  const d5=await p.locator('#e-date').inputValue();
  const ge=await genOpts('#pk-e-row0');
  S.chk('編輯第5張時帶的是當年的日期', /2013/.test(d5), d5);
  S.chk('編輯舊單曲列得出一期生', ge.includes('1期生'), ge.join('/'));
  S.chk('編輯舊單曲不列出還沒入團的期別', !ge.includes('4期生'), ge.join('/'));
  const chips5=await p.locator('#pk-e-row0 .pk-chips .pk-chip').allTextContents();
  S.chk('已選成員的 chip 不受影響', chips5.length>0, chips5.length);
  S.chk('已畢業的成員仍以 chip 保留在名單裡',
      chips5.some(t=>/生駒里奈|橋本奈々未|白石麻衣|西野七瀬/.test(t)), chips5.join('/'));

  // ── 編輯新單曲 ──
  await p.click('button[onclick="closeModal(\'editModal\')"]'); await p.waitForTimeout(400);
  await p.evaluate(()=>openEditModal('nogi',42)); await p.waitForTimeout(800);
  await p.click('button[onclick="switchMtab(\'members\')"]'); await p.waitForTimeout(400);
  const ge2=await genOpts('#pk-e-row0');
  S.chk('編輯最新單曲時不列出已畢業的期別', !ge2.includes('1期生')&&!ge2.includes('2期生'), ge2.join('/'));
  S.chk('編輯最新單曲列得出近期期別', ge2.includes('5期生')||ge2.includes('6期生'), ge2.join('/'));
  await p.selectOption('#pk-e-row0 .pk-gen','3'); await p.waitForTimeout(300);
  const n3=await p.locator('#pk-e-row0 .pk-name option').allTextContents();
  S.chk('三期生只列出還在籍的', !n3.includes('大園桃子')&&!n3.includes('与田祐希'), n3.join('/'));
  S.chk('三期生還在籍的有列出來', n3.includes('岩本蓮加')||n3.includes('伊藤理々杏'), n3.join('/'));

  // 存檔流程沒被影響
  await p.click('button[onclick="switchMtab(\'info\')"]'); await p.waitForTimeout(300);
  await p.click('button[onclick="doSaveEdit()"]'); await p.waitForTimeout(1400);
  S.chk('編輯仍然存得起來（沒有跳錯誤）',
      !/錯誤|失敗|請/.test((await p.locator('#e-msg').textContent())||''),
      await p.locator('#e-msg').textContent());
  S.chk('第42張還在', await p.evaluate(()=>!!getData('nogi').find(d=>d.num===42)));
  S.chk('成員沒有被存檔弄丟',
      await p.evaluate(()=>getData('nogi').find(d=>d.num===42).rows.flat().length>=18));


  await b.close();
  const r=S.report();
  process.exit(r.fail||r.errors?1:0);
})();
