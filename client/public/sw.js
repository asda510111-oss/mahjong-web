// Minimal service worker: network-first for HTML/JS, fallback to cache
// 讓 PWA 可安裝，順便離線時能顯示最後的 UI 殼（無法連線對戰，但介面會載入）
const CACHE = 'mahjong-v1'
const CORE = ['/', '/index.html', '/manifest.webmanifest', '/icon.svg']

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).catch(() => {}))
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (e) => {
  const { request } = e
  // 只處理 GET
  if (request.method !== 'GET') return
  // WebSocket/跨域一律交給瀏覽器
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  e.respondWith(
    fetch(request)
      .then((res) => {
        const copy = res.clone()
        caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {})
        return res
      })
      .catch(() => caches.match(request).then((r) => r || caches.match('/index.html')))
  )
})
