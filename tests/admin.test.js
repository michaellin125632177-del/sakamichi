// 管理員權限：只有 ADMIN_UIDS 裡的帳號看得到編輯入口。
// ※ 這測的是介面層。真正擋寫入的是 Firestore 規則，測試碰不到。
const {launch,openPage,seed,suite,ADMIN_UID}=require('./lib');
const S=suite('管理員權限');

const state=p=>p.evaluate(()=>({
  canEdit:canEdit(), adminSet:adminListSet(),
  guest:document.body.classList.contains('is-guest'),
  btn:document.getElementById('auth-btn').textContent,
  btnTitle:document.getElementById('auth-btn').title,
  green:document.getElementById('auth-btn').classList.contains('signed-in'),
  warnShown:(()=>{const w=document.getElementById('admin-warn');
    return !!w&&w.style.display!=='none';})(),
  addVisible:!!document.querySelector('button[onclick="openAddModal()"]')?.offsetParent,
  manageVisible:!!document.querySelector('button[onclick="openManageModal()"]')?.offsetParent,
  editBtns:[...document.querySelectorAll('.card-edit-btn')].filter(e=>e.offsetParent).length
}));

(async()=>{
  const b=await launch();
  const open=auth=>openPage(b,{auth,viewport:{width:1280,height:1000},onError:S.onError});

  // ── 管理員本人 ──
  let p=await open({uid:ADMIN_UID,name:'管理員',email:'admin@example.com'});
  await seed(p);
  let s=await state(p);
  S.chk('ADMIN_UIDS 已設定', s.adminSet);
  S.chk('管理員 canEdit() 為真', s.canEdit);
  S.chk('管理員不是訪客模式', !s.guest);
  S.chk('管理員看得到「＋ 新增」', s.addVisible);
  S.chk('管理員看得到「🗑 管理」', s.manageVisible);
  S.chk('管理員看得到卡片上的編輯鈕', s.editBtns>0, s.editBtns);
  S.chk('管理員的按鈕是打勾綠色', s.green&&/^✓/.test(s.btn), s.btn);
  S.chk('管理員按鈕提示是登出', s.btnTitle.includes('登出'), s.btnTitle);
  S.chk('設定好 UID 後警告橫幅消失', !s.warnShown);
  S.chk('管理員改得動資料', await p.evaluate(async()=>{
    await db.collection('nogi').doc('42').update({zh:'測試改寫'});
    return true;}));
  await p.waitForTimeout(600);
  await p.click('#auth-btn'); await p.waitForTimeout(700);
  s=await state(p);
  S.chk('管理員登出後變訪客', s.guest&&!s.canEdit);
  S.chk('登出後按鈕變回「登入」', /登入/.test(s.btn)&&!s.green, s.btn);
  await p.close();

  // ── 登入了，但不是管理員 ──
  p=await open({uid:'somebody-else-999',name:'路人',email:'x@example.com'});
  await seed(p);
  s=await state(p);
  S.chk('別的帳號 canEdit() 為假', !s.canEdit);
  S.chk('別的帳號是訪客模式', s.guest);
  S.chk('別的帳號看不到「＋ 新增」', !s.addVisible);
  S.chk('別的帳號看不到「🗑 管理」', !s.manageVisible);
  S.chk('別的帳號看不到卡片編輯鈕', s.editBtns===0, s.editBtns);
  S.chk('別的帳號按鈕不是綠色', !s.green, s.btn);
  S.chk('按鈕顯示人名而不是「登入」', /^👤/.test(s.btn)&&!/🔑/.test(s.btn), s.btn);
  S.chk('提示說明沒有編輯權限', s.btnTitle.includes('沒有編輯權限'), s.btnTitle);
  // 回歸測試：登入了卻不是管理員時，按鈕不能又去叫一次登入（會卡住登不出去）
  await p.evaluate(()=>{window.__signInCalls=0;window.__signOutCalls=0;});
  await p.click('#auth-btn'); await p.waitForTimeout(700);
  const calls=await p.evaluate(()=>({i:window.__signInCalls||0,o:window.__signOutCalls||0}));
  S.chk('非管理員按按鈕是登出，不是重複登入', calls.o===1&&calls.i===0, JSON.stringify(calls));
  s=await state(p);
  S.chk('登出後回到未登入狀態', /🔑/.test(s.btn), s.btn);
  await p.close();

  // ── 完全沒登入 ──
  p=await open({signedOut:true});
  await seed(p);
  s=await state(p);
  S.chk('未登入 canEdit() 為假', !s.canEdit);
  S.chk('未登入是訪客模式', s.guest);
  S.chk('未登入看不到編輯入口', !s.addVisible&&!s.manageVisible&&s.editBtns===0);
  S.chk('未登入看得到資料', (await p.locator('#nogi-grid .card').count())>0,
        await p.locator('#nogi-grid .card').count());
  S.chk('未登入也看得到排行榜', await p.evaluate(()=>{
    toggleRankPanel();
    return document.querySelectorAll('#rank-panel-body .rank-row').length>0;}));
  await p.close();

  await b.close();
  const r=S.report();
  process.exit(r.fail||r.errors?1:0);
})();
