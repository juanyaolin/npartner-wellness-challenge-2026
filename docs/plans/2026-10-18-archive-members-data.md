# 參賽名單資料封存到 Git

狀態：完成

接續 `docs/plans/2026-10-18-archive-status-data.md` 的後續待辦。

## 做法

- 下載 `assets/js/members.js` 讀取的參賽名單 Google Sheet，存成 `data/members.csv`（29 筆；欄位只有時間戳記、參賽者暱稱、參加項目、性別）。
- `members.js` 的 `csvUrl` 改為 `./data/members.csv`，其餘邏輯不動。

## 成果

- 照做法完成，無偏差。
- 驗證：本機 `index.html`、`walking.html`、`health.html` 只請求 `data/members.csv`，人數與改前讀 Google Sheet 相同（健走 27、男子健康 11、女子健康 12）。
- 已知限制：已部署的網站上，瀏覽器可能在快取到期前仍用舊版 `members.js` 讀 Google Sheet；Sheet 未下架前不影響結果。
