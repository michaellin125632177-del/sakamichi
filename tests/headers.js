// 讀 Cloudflare Pages 的 _headers，套到測試伺服器的回應上。
//
// ※ 這是「夠用就好」的近似實作，不是 Cloudflare 的完整語意：只支援
//   開頭或結尾的 * 萬用字元，不支援 :placeholder 與跨專案的 proxy 規則。
//   所以測試能驗出語法錯誤與規則涵蓋範圍，但上線後仍要對實際網站確認一次。
const fs=require('fs');

function parse(text){
  const rules=[]; let cur=null;
  text.split('\n').forEach((raw,i)=>{
    const line=raw.replace(/\s+$/,'');
    if(!line.trim()||line.trim().startsWith('#'))return;
    if(!/^\s/.test(line)){                       // 沒縮排 → 路徑
      cur={path:line.trim(),headers:[],line:i+1}; rules.push(cur);
    }else{                                       // 有縮排 → 標頭
      const m=/^\s+([A-Za-z0-9-]+):\s*(.*)$/.exec(line);
      if(!m)throw new Error('_headers 第 '+(i+1)+' 行看不懂：'+line);
      if(!cur)throw new Error('_headers 第 '+(i+1)+' 行的標頭沒有對應的路徑');
      cur.headers.push([m[1],m[2]]);
    }
  });
  return rules;
}

function matches(pattern,path){
  if(pattern===path)return true;
  if(pattern.endsWith('/*'))return path.startsWith(pattern.slice(0,-1));
  if(pattern==='/*')return true;
  return false;
}

// 依序套用所有命中的規則，後面的覆蓋前面的（與 Pages 行為一致）
function headersFor(rules,path){
  const out={};
  rules.forEach(r=>{if(matches(r.path,path))r.headers.forEach(([k,v])=>{out[k]=v;});});
  return out;
}

function load(file){
  if(!fs.existsSync(file))return {rules:[],headersFor:()=>({})};
  const rules=parse(fs.readFileSync(file,'utf8'));
  return {rules,headersFor:p=>headersFor(rules,p)};
}

module.exports={parse,matches,headersFor,load};
