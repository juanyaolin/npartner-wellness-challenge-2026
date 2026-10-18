# 賽況資料封存到 Git

狀態：完成

## 背景

比賽已結束（最後一期健走週資料為 2026/10/05–10/11，最後一次量測 2026/10/12）。`status.html` 目前每次載入都從三張已發布的 Google Sheet CSV 讀取（`assets/js/status.js` 的 `STATUS_CONFIG.contests.*.csvUrl`）。改為把最終資料保存在 repo，頁面只讀本機檔案，不再依賴 Google Sheet。

## 做法

1. **封存資料**：下載三張 CSV，覆寫 `data/walking.csv`、`data/health-men.csv`、`data/health-women.csv`。
   - 這三個檔案目前是初版的假資料（如「健走01」），沒有程式引用；原規劃文件 `docs/status-page-planning.md` 本來就預定正式資料放在這個路徑。
   - 內容原樣保存（UTF-8，不重新排版數字），之後要追溯就看 Git 歷史。
2. **改讀取來源**（`assets/js/status.js`）：
   - 刪掉三個 `csvUrl`。
   - `resolveCsvUrl()`：預設回傳 `./data/${contest.fileName}`；`?source=local&scenario=...` 的測試情境照舊讀 `data/scenarios/`（`status-scenarios.html` 仍在用）。
   - `getSourceSettings()` 的預設值 `"google"` 改名為 `"archive"`；`fetch` 的 `cache: "no-store"` 拿掉（資料不再變動，用瀏覽器預設快取即可）。
3. **驗證**：本機開 `status.html`，三個賽別都能載入並顯示到最後一期；`status-scenarios.html` 的情境連結仍正常。

## 不做

- 不加重新抓取資料的腳本：比賽已結束，只抓這一次。
- `assets/js/members.js`（`index.html`、`walking.html`、`health.html` 用的參賽名單）也還在讀另一張 Google Sheet。你只提到 `status.html`，這次先不動。

## 需要你確認

- **資料是否已修正**：記錄顯示 10/14 發現 Google Sheet 數據有問題，預定 10/15 請人修正。封存會以今天（10/18）抓到的內容為準，請確認修正已完成。
- **公開範圍**：repo 是 public。封存的只有暱稱與步數、身體數據變化率，且這些 CSV 本來就公開發布在網路上，但進 Git 後就無法真正撤回。
- `members.js` 是否一併封存。

## 成果

- 照計畫完成，無偏差。2026/10/18 抓取的資料：健走 517 筆、男子健康 129 筆、女子健康 141 筆；使用者確認網頁上的資料正確（10/14 發現的數據問題已修正）。
- Google Sheet 原檔是 CRLF 換行，進 Git 時依 repo 設定轉成 LF；PapaParse 兩種都能解析。
- 驗證：本機 `status.html` 三個賽別只請求 `data/*.csv`，健走播到第 18 週（10/05），健康賽播到第 10 次量測（10/12），沒有錯誤；`?source=local&scenario=partial-missing` 仍讀 `data/scenarios/`。
- 後續待辦：`assets/js/members.js` 的參賽名單仍讀 Google Sheet，Sheet 若下架，`index.html`、`walking.html`、`health.html` 的名單會載入失敗。
