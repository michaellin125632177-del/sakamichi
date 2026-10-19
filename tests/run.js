#!/usr/bin/env node
// 跑完整個測試套件。會自己起好需要的靜態伺服器，跑完收掉。
//
//   node tests/run.js            跑全部
//   node tests/run.js admin      只跑名字含 admin 的
const {spawn}=require('child_process');
const fs=require('fs');
const path=require('path');
const http=require('http');

const ROOT=path.join(__dirname,'..');
const SITE_FILES=['index.html','manifest.json','sw.js','icon-192.png','icon-512.png'];

// ── 內建的靜態伺服器（不想多裝套件）──
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
  '.json':'application/json; charset=utf-8','.png':'image/png','.svg':'image/svg+xml'};
function serve(dir,port){
  const srv=http.createServer((req,res)=>{
    let p=decodeURIComponent(req.url.split('?')[0]);
    if(p.endsWith('/'))p+='index.html';
    const file=path.join(dir,path.normalize(p));
    if(!file.startsWith(dir)){res.writeHead(403);return res.end();}
    fs.readFile(file,(e,buf)=>{
      if(e){res.writeHead(404);return res.end('not found');}
      res.writeHead(200,{'Content-Type':MIME[path.extname(file)]||'application/octet-stream'});
      res.end(buf);
    });
  });
  return new Promise((resolve,reject)=>{
    srv.once('error',e=>reject(e.code==='EADDRINUSE'
      ? new Error('連接埠 '+port+' 已被佔用。先關掉那個程式再跑一次'+
                  '（例如之前沒收乾淨的 http.server）。')
      : e));
    srv.listen(port,'127.0.0.1',()=>resolve(srv));
  });
}

// pwa 測試要同時驗「子目錄」與「根目錄」兩種部署，所以多備一份副本
function stage(){
  const tmp=fs.mkdtempSync(path.join(require('os').tmpdir(),'sakamichi-test-'));
  const sub=path.join(tmp,'sub','sakamichi'), root=path.join(tmp,'root');
  fs.mkdirSync(sub,{recursive:true}); fs.mkdirSync(root,{recursive:true});
  SITE_FILES.forEach(f=>{
    const src=path.join(ROOT,f);
    if(!fs.existsSync(src))return;
    fs.copyFileSync(src,path.join(sub,f));
    fs.copyFileSync(src,path.join(root,f));
  });
  return {tmp,sub:path.join(tmp,'sub'),root};
}

function runOne(file){
  return new Promise(r=>{
    const p=spawn(process.execPath,[file],{stdio:'inherit',cwd:__dirname,
      env:{...process.env}});
    p.on('close',code=>r(code));
  });
}

(async()=>{
  const filter=process.argv[2];
  const files=fs.readdirSync(__dirname)
    .filter(f=>f.endsWith('.test.js'))
    .filter(f=>!filter||f.includes(filter))
    .sort();
  if(!files.length){console.log('沒有符合的測試檔。');process.exit(0);}

  const st=stage();
  let servers=[];
  try{
    servers=[await serve(ROOT,8098),await serve(st.sub,8099),await serve(st.root,8100)];
  }catch(e){
    servers.forEach(s=>s.close());
    fs.rmSync(st.tmp,{recursive:true,force:true});
    console.error('\n✗ '+e.message);
    process.exit(1);
  }
  console.log('測試伺服器已啟動（8098 主站、8099 子目錄、8100 根目錄）');

  const failed=[];
  for(const f of files){
    const code=await runOne(path.join(__dirname,f));
    if(code!==0)failed.push(f);
  }

  servers.forEach(s=>s.close());
  fs.rmSync(st.tmp,{recursive:true,force:true});

  console.log('\n'+'═'.repeat(50));
  if(failed.length){
    console.log('✗ 有測試檔沒過：'+failed.join('、'));
    process.exit(1);
  }
  console.log('✓ '+files.length+' 個測試檔全部通過');
})();
