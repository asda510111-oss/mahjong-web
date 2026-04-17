# 台灣麻將網頁遊戲

TypeScript + React + Vite（前端）+ Node.js + ws（後端）實作的線上台灣麻將。

## 功能規劃

- ✅ 專案骨架、前後端連線
- ✅ 房間碼建立 / 加入
- ⬜ 完整台灣麻將規則（16 張）
- ⬜ 摸打、吃碰槓、聽胡判斷
- ⬜ 台數計分
- ⬜ AI 機器人補位
- ⬜ 自動配對
- ⬜ 卡通牌面圖片
- ⬜ 部署（Netlify + Render）

## 開發環境

需要 Node.js 18+。

### 1. 啟動後端（WebSocket 伺服器）

```bash
cd server
npm install
npm run dev
```

伺服器預設 port：`8080`

### 2. 啟動前端（Vite dev server）

另開一個終端機：

```bash
cd client
npm install
npm run dev
```

開啟瀏覽器 http://localhost:5173

## 目錄結構

```
mahjong_web/
├── client/          # React 前端
│   └── src/
│       ├── components/   # UI 元件
│       ├── game/         # 牌型、規則（共用於前後端）
│       └── net/          # WebSocket 客戶端
└── server/          # Node.js WebSocket 後端
    └── src/
        ├── game/         # 遊戲引擎
        └── room.ts       # 房間管理
```

## 規則

台灣 16 張麻將。詳細規則與台數表待補。
