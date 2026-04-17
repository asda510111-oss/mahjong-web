# 公網部署指南

架構：
- **前端**（靜態檔）→ Netlify（免費）
- **後端**（WebSocket）→ Render（免費，但會冷啟動）
- **版控** → GitHub（免費）

整個流程約 20~30 分鐘。

---

## Step 1：把專案推上 GitHub

### 1.1 建 GitHub 帳號
到 https://github.com 註冊（已經有就跳過）。

### 1.2 在 GitHub 建一個新 repo
1. 右上角 `+` → `New repository`
2. 名稱：例如 `mahjong-web`
3. **不要**勾 "Initialize this repository with a README"
4. 按 `Create repository`
5. 先不要關網頁，等一下會用到

### 1.3 在本機初始化 git + 推上去
開 PowerShell，在專案根目錄：
```powershell
cd C:\Users\a5101\Desktop\mahjong_web

# 安裝 git (如果還沒裝)：https://git-scm.com/download/win

git init
git add .
git commit -m "initial commit"
git branch -M main

# 把下面的 URL 換成你 GitHub 那一頁顯示的 repo URL
git remote add origin https://github.com/你的帳號/mahjong-web.git
git push -u origin main
```

如果推送要求登入，依提示操作。

---

## Step 2：部署後端到 Render

### 2.1 建 Render 帳號
到 https://render.com 用 GitHub 登入。

### 2.2 建立服務
1. Dashboard → `New +` → `Web Service`
2. 連接你剛推的 GitHub repo
3. 設定：
   - **Name**：`mahjong-relay`（可自訂，會成為域名）
   - **Root Directory**：`server`
   - **Runtime**：`Node`
   - **Build Command**：`npm install && npm run build`
   - **Start Command**：`npm start`
   - **Instance Type**：`Free`
4. 按 `Create Web Service`

### 2.3 等候部署
約 2~5 分鐘。成功後會看到日誌：
```
[Server] Mahjong relay listening on port 10000
```
（Render 自動把外部的 443 導到內部 PORT）

### 2.4 記下後端網址
你的後端 URL 會是：`https://mahjong-relay.onrender.com`  
WebSocket URL 為：`wss://mahjong-relay.onrender.com`

---

## Step 3：部署前端到 Netlify

### 3.1 建 Netlify 帳號
到 https://app.netlify.com 用 GitHub 登入。

### 3.2 建立網站
1. `Add new site` → `Import an existing project`
2. 連接 GitHub 選你的 repo
3. 設定（`netlify.toml` 會自動填好大部分）：
   - **Base directory**：`client`
   - **Build command**：`npm install && npm run build`
   - **Publish directory**：`client/dist`

### 3.3 設定環境變數（重要！）
1. 進入該網站 → `Site settings` → `Environment variables`
2. `Add a variable`：
   - Key：`VITE_WS_URL`
   - Value：`wss://mahjong-relay.onrender.com`（用你 Render 給的）
3. 儲存

### 3.4 重新部署
1. `Deploys` 分頁 → `Trigger deploy` → `Deploy site`
2. 等 1~2 分鐘
3. 部署完成，Netlify 給你一個公開網址：`https://xxxxx.netlify.app`

---

## Step 4：測試

打開 Netlify 網址，建房、加 AI、開始遊戲。  
分享這個網址給朋友，兩人都能連（手機、電腦、跨裝置都可）。

---

## 常見問題

### Q. Render 冷啟動很慢？
免費方案 15 分鐘無流量會休眠，下次連線要等 30~60 秒喚醒。  
**解法**：升級付費 $7/月、或定時用 cron-job.org ping 你的 Render URL 保持喚醒。

### Q. 朋友連不到
- 檢查 Netlify 的 `VITE_WS_URL` 是不是 `wss://`（不是 `ws://`，會被瀏覽器擋）
- Render 第一次喚醒可能要等久一點，刷新再試

### Q. 改 code 後怎麼更新？
推到 GitHub：
```powershell
git add .
git commit -m "some change"
git push
```
Netlify 和 Render 都會自動重新部署。

### Q. 想用自己的域名（例如 `mymahjong.com`）
- **Netlify**：Site settings → Domain management → Add custom domain
- 需要在域名註冊商設 DNS
