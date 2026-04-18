// Service Worker：最新優先策略
//
// 策略：
// - HTML / manifest / sw.js：永遠網路優先（不讀快取），確保部署後立即拿到新版
// - 其他資源（JS/CSS/圖片，Vite 會加 hash）：網路優先但失敗時用快取，達成離線殼
// - 激活時自動清掉舊版本快取
//
// 如何強制每次部署都更新：每次 push 自動更換 CACHE 名稱即可；這裡用 BUILD 時間當版本。

const VERSION = 'v2-' + self.registration?.scope // 有 scope 作後綴
const CACHE = 'mahjong-' + VERSION

// 「絕不吃快取」的請求類型（總是拿最新）
const NEVER_CACHE = (url) =>
  url.pathname === '/' ||
  url.pathname === '/index.html' ||
  url.pathname === '/manifest.webmanifest' ||
  url.pathname === '/sw.js'

self.addEventListener('install', (e) => {
  // 新 SW 裝好立刻接手，不等舊分頁關閉
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      // 清掉所有舊版本快取
      const keys = await caches.keys()
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      await self.clients.claim()
      // 通知所有開著的分頁：新版 SW 已上線
      const clients = await self.clients.matchAll({ type: 'window' })
      for (const c of clients) c.postMessage({ type: 'sw-updated' })
    })(),
  )
})

self.addEventListener('fetch', (e) => {
  const { request } = e
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // HTML/manifest/sw 一律網路優先、絕不回快取（避免部署後使用者看到舊版）
  if (NEVER_CACHE(url) || request.mode === 'navigate') {
    e.respondWith(
      fetch(request, { cache: 'no-store' }).catch(() =>
        caches.match('/index.html').then((r) => r || new Response('離線', { status: 503 })),
      ),
    )
    return
  }

  // 其他資源：網路優先（放入快取）+ 離線時走快取
  e.respondWith(
    fetch(request)
      .then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {})
        }
        return res
      })
      .catch(() => caches.match(request).then((r) => r || new Response('', { status: 504 }))),
  )
})

// 允許頁面叫 SW 立刻跳過 waiting（搭配前端的「發現新版本 → reload」流程）
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'skip-waiting') self.skipWaiting()
})
