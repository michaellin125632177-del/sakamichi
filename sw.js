// 坂道選拔名單 — Service Worker
// 策略：
//   - 頁面導覽走「網路優先」，離線時才回退到快取。避免改版後被舊快取困住。
//   - 靜態資源（圖示、manifest、Firebase SDK）走「快取優先」並在背景更新。
//   - Firestore 的 API 流量一律不碰，交給 Firestore 自己的離線持久化。
const VERSION = 'v1';
const SHELL = 'sakamichi-shell-' + VERSION;
const RUNTIME = 'sakamichi-runtime-' + VERSION;

const SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// 可離線快取的第三方來源（Firebase SDK）
const CDN_HOSTS = ['www.gstatic.com'];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    // 逐一加入，單一資源失敗不要讓整個安裝失敗
    await Promise.all(SHELL_ASSETS.map(url =>
      cache.add(new Request(url, { cache: 'reload' })).catch(() => {})
    ));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(k => k.startsWith('sakamichi-') && k !== SHELL && k !== RUNTIME)
      .map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

function isCdn(url) {
  return CDN_HOSTS.includes(url.hostname);
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  const sameOrigin = url.origin === self.location.origin;

  // Firestore／其他 API：完全不介入
  if (!sameOrigin && !isCdn(url)) return;

  // 頁面導覽：網路優先，離線才用快取
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(SHELL);
        cache.put('./index.html', fresh.clone()).catch(() => {});
        return fresh;
      } catch (e) {
        return (await caches.match('./index.html')) ||
               (await caches.match('./')) ||
               Response.error();
      }
    })());
    return;
  }

  // 靜態資源：快取優先，背景更新
  event.respondWith((async () => {
    const cached = await caches.match(req);
    const network = fetch(req).then(res => {
      if (res && (res.ok || res.type === 'opaque')) {
        caches.open(sameOrigin ? SHELL : RUNTIME)
          .then(c => c.put(req, res.clone()))
          .catch(() => {});
      }
      return res;
    }).catch(() => null);
    return cached || (await network) || Response.error();
  })());
});

// 讓頁面能主動要求立即套用新版本
self.addEventListener('message', event => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});
