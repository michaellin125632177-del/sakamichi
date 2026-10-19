// 測試共用工具：解析 playwright、開瀏覽器、灌資料、記錄檢查結果。
const fs=require('fs');
const path=require('path');

// playwright 可能裝在專案裡，也可能是環境裡的全域安裝
function loadPlaywright(){
  const candidates=[
    'playwright',
    '/opt/node22/lib/node_modules/playwright',
    '/usr/lib/node_modules/playwright'
  ];
  for(const c of candidates){
    try{ return require(c); }catch(e){ /* 換下一個 */ }
  }
  throw new Error('找不到 playwright。請先 `npm i -D playwright`，'+
    '或設定環境變數 NODE_PATH 指向全域安裝位置。');
}

const MOCK=fs.readFileSync(path.join(__dirname,'mock.js'),'utf8');
const BASE=process.env.SAKAMICHI_BASE||'http://127.0.0.1:8098/';
// 站長本人的 UID，與 index.html 的 ADMIN_UIDS 一致
const ADMIN_UID='cHr53MtDS0OgfHm7xC9E1CVtbpA2';

async function launch(){
  const {chromium}=loadPlaywright();
  const opts={};
  const exe=process.env.PW_CHROMIUM||'/opt/pw-browsers/chromium';
  if(fs.existsSync(exe))opts.executablePath=exe;   // 沒有就用 playwright 自己下載的
  return chromium.launch(opts);
}

// 開一個已經注入假 Firebase 的分頁。auth 可指定登入身分（見 mock.js）。
async function openPage(browser,{auth,base,viewport,onError}={}){
  const page=await browser.newPage({viewport:viewport||{width:1200,height:1000}});
  if(onError)page.on('pageerror',e=>onError('PAGEERROR: '+e.message));
  if(auth)await page.addInitScript('window.__MOCK_AUTH='+JSON.stringify(auth)+';');
  await page.addInitScript(MOCK);
  await page.goto((base||BASE)+'index.html',{waitUntil:'domcontentloaded'});
  await page.waitForTimeout(1500);
  return page;
}

// 把內建的基礎資料灌進假資料庫。不經過 UI，所以訪客身分也能用。
async function seed(page){
  await page.evaluate(async()=>{
    const batch=db.batch();
    ['nogi','hinata','sakura','keyaki','aoba'].forEach(g=>
      getBase(g).forEach(e=>batch.set(db.collection(g).doc(String(e.num)),toDoc({...e}))));
    await batch.commit();
  });
  await page.waitForTimeout(1600);
}

// 一個測試檔的結果收集器
function suite(title){
  const results=[],errors=[];
  return {
    chk(name,pass,detail){
      results.push({name,pass:!!pass,detail:detail===undefined?'':String(detail)});
    },
    err(msg){errors.push(msg);},
    onError(msg){errors.push(msg);},
    report(){
      const pass=results.filter(r=>r.pass).length;
      console.log('\n'+title+'：通過 '+pass+' / '+results.length+'\n');
      results.forEach(r=>console.log((r.pass?'  ✓ ':'  ✗ ')+r.name+
        (r.detail?'  ['+r.detail+']':'')));
      if(errors.length)console.log('\n  頁面錯誤：\n'+errors.map(e=>'    '+e).join('\n'));
      return {total:results.length,pass,fail:results.length-pass,errors:errors.length};
    }
  };
}

module.exports={loadPlaywright,launch,openPage,seed,suite,MOCK,BASE,ADMIN_UID};
