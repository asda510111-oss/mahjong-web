import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

// 註冊 Service Worker（PWA 支援：可加到主畫面、離線殼）
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        // 發現 waiting 中的新 SW → 叫它跳過 waiting
        const takeOver = () => {
          if (reg.waiting) reg.waiting.postMessage({ type: 'skip-waiting' })
        }
        if (reg.waiting) takeOver()
        reg.addEventListener('updatefound', () => {
          const nw = reg.installing
          if (!nw) return
          nw.addEventListener('statechange', () => {
            if (nw.state === 'installed' && navigator.serviceWorker.controller) takeOver()
          })
        })
        // 每次頁面開啟檢查一次更新
        reg.update().catch(() => {})
      })
      .catch((err) => {
        console.warn('[PWA] Service worker registration failed:', err)
      })

    // 新 SW 上線後重新載入頁面（只觸發一次，避免無限重載）
    let reloaded = false
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloaded) return
      reloaded = true
      window.location.reload()
    })
  })
}
