# 測試

用 Playwright 在真的 Chromium 裡開網站跑。Firebase 被換成假的（`mock.js`），
所以**不會連到雲端、不會動到正式資料**，也不需要網路。

## 怎麼跑

```bash
node tests/run.js            # 全部
node tests/run.js admin      # 只跑檔名含 admin 的
```

`run.js` 會自己起好三個本機靜態伺服器（跑完自動收掉）：

| 埠號 | 服務內容 | 為什麼需要 |
|---|---|---|
| 8098 | 專案根目錄 | 一般測試 |
| 8099 | `/sakamichi/` 子目錄 | 模擬 GitHub Pages 專案頁 |
| 8100 | 網站根目錄 | 模擬自訂網域 |

全過會印 `✓ N 個測試檔全部通過` 並以 exit code 0 結束；有任何一項沒過
或出現頁面 JS 錯誤就是 exit code 1。

### 需要的東西

- Node 18 以上
- Playwright 與 Chromium

專案裡沒裝的話，`lib.js` 會去找環境裡的全域安裝。兩個環境變數可以覆寫：

- `PW_CHROMIUM` — Chromium 執行檔路徑（預設 `/opt/pw-browsers/chromium`，
  找不到就用 Playwright 自己下載的那份）
- `SAKAMICHI_BASE` — 主站網址（預設 `http://127.0.0.1:8098/`）

## 檔案

| 檔案 | 測什麼 |
|---|---|
| `lib.js` | 共用：開瀏覽器、注入假 Firebase、灌資料、收集結果 |
| `mock.js` | 假的 Firebase compat SDK（Firestore + Auth） |
| `run.js` | 跑全部，並管理上面那三個伺服器 |
| `admin.test.js` | 管理員權限：三種身分各自看得到／看不到什麼 |
| `picker-date.test.js` | 新增／編輯單曲時，成員選單依發行日只列當時在籍的人 |
| `pwa.test.js` | manifest 的 `start_url`／`scope` 在兩種部署下都正確 |
| `smoke.test.js` | 主要畫面都畫得出來、沒有 JS 錯誤 |

## 寫新測試

檔名取成 `*.test.js` 放進這個資料夾，`run.js` 會自動撿到。骨架：

```js
const {launch,openPage,seed,suite}=require('./lib');
const S=suite('這個檔在測什麼');

(async()=>{
  const b=await launch();
  const p=await openPage(b,{onError:S.onError});
  await seed(p);                       // 把內建的單曲資料灌進假資料庫

  S.chk('描述這項檢查', 條件, '附註');

  await b.close();
  const r=S.report();
  process.exit(r.fail||r.errors?1:0);   // 有失敗或頁面錯誤就非 0
})();
```

要換登入身分就傳 `auth`：

```js
const {ADMIN_UID}=require('./lib');
await openPage(b,{auth:{uid:ADMIN_UID,name:'管理員'}});   // 管理員
await openPage(b,{auth:{uid:'someone-else'}});            // 登入但沒權限
await openPage(b,{auth:{signedOut:true}});                // 沒登入
```

不傳 `auth` 的話，預設就是以管理員身分登入。

## 測不到的地方

**Firestore 安全規則。** 假的 Firebase 沒有規則引擎，所以 `admin.test.js`
驗的是「介面有沒有把編輯入口藏好」，不是「資料庫擋不擋得住寫入」。
真正的把關在 Firebase Console 的規則，那個只能在線上驗：

```
allow read: if true;
allow write: if request.auth != null && request.auth.uid == '<站長 UID>';
```
