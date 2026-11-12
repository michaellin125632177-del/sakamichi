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
  // 面板改成下注模式之後，一般玩家登入是為了下注而不是編輯，
  // 所以提示改成講「你是誰、點了會登出」，不再提編輯權限。
  S.chk('提示說明目前是誰、按了會登出',
        s.btnTitle.includes('路人')&&s.btnTitle.includes('登出'), s.btnTitle);
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

  // ── 成員編輯：出身地／身高／血型 ──
  p=await open({uid:ADMIN_UID,name:'管理員',email:'admin@example.com'});
  await seed(p);
  const ME=await p.evaluate(async()=>{
    const v=id=>document.getElementById(id).value;
    const set=(id,x)=>{document.getElementById(id).value=x;};
    const rows=()=>[...document.querySelectorAll('#member-panel .mp-row')]
      .map(r=>r.querySelector('.mp-lbl').textContent+'='+
              r.querySelector('.mp-val').textContent);

    openMemberEdit('nogi','井上和');
    const filled={home:v('me-home'),ht:v('me-ht'),blood:v('me-blood')};

    set('me-home','台北市'); set('me-ht','161.5'); set('me-blood','O');
    saveMemEdit();
    await new Promise(r=>setTimeout(r,700));
    const saved=getMemberInfo('nogi','井上和');
    openMemberPanel('nogi','井上和');
    const shown=rows();

    // 清空：內建名冊有值，要寫得掉才行
    openMemberEdit('nogi','井上和');
    set('me-home',''); set('me-ht',''); set('me-blood','');
    saveMemEdit();
    await new Promise(r=>setTimeout(r,700));
    const cleared=getMemberInfo('nogi','井上和');
    openMemberPanel('nogi','井上和');
    const afterClear=rows();

    // 新增成員時三欄要是空的
    openAddMember();
    const blank={home:v('me-home'),ht:v('me-ht'),blood:v('me-blood')};
    closeModal('memberEditModal');
    return {filled,saved:{home:saved.home,ht:saved.ht,blood:saved.blood},
            shown,cleared:{home:cleared.home,ht:cleared.ht,blood:cleared.blood},
            afterClear,blank};
  });
  S.chk('編輯時帶出名冊裡的現有資料',
        ME.filled.home==='神奈川県'&&ME.filled.ht==='158'&&ME.filled.blood==='B',
        JSON.stringify(ME.filled));
  S.chk('改完存得起來',
        ME.saved.home==='台北市'&&ME.saved.ht===161.5&&ME.saved.blood==='O',
        JSON.stringify(ME.saved));
  S.chk('面板跟著變',
        ME.shown.includes('出身地=台北市')&&ME.shown.includes('身高=161.5 cm')
        &&ME.shown.includes('血型=O 型'), ME.shown.join(' / '));
  S.chk('清空蓋得掉內建的值（不會被 undefined 忽略）',
        !ME.cleared.home&&!ME.cleared.ht&&!ME.cleared.blood,
        JSON.stringify(ME.cleared));
  S.chk('清空後面板不再列那三列',
        !ME.afterClear.some(x=>/^(出身地|身高|血型)=/.test(x)),
        ME.afterClear.join(' / '));
  S.chk('新增成員時三欄是空的',
        !ME.blank.home&&!ME.blank.ht&&!ME.blank.blood, JSON.stringify(ME.blank));

  await b.close();
  const r=S.report();
  process.exit(r.fail||r.errors?1:0);
})();
