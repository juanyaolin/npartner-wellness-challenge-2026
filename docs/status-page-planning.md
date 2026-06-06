# N-Partner 三比八大賽 2026 賽況頁規劃筆記

> 本文件整理目前討論過的賽事資訊、資料格式、賽況頁設計與實作注意事項。未來若需要回顧專案脈絡，優先讀取此文件，不需要依賴 Hermes memory。

## 1. 專案定位

- 專案名稱：N-Partner 三比八大賽 2026
- 主要用途：公司內部 / intranet 使用的活動介紹與賽況展示網站
- 部署型態：靜態網站，目標可部署到 GitHub Pages
- 專案路徑：`/mnt/c/www/npartner-wellness-challenge-2026`
- 目前重要頁面：
  - `index.html`：首頁
  - `hahago.html`：HAHAGO 說明頁
  - `walking.html`：健走賽介紹頁
  - `health.html`：健康賽介紹頁
  - `status.html`：預計新增的單一賽況頁

## 2. 頁面導覽規劃

主頁與各項賽事頁都需要有可以跳轉到賽況頁的按鈕。

建議導覽：

```text
首頁 index.html
├─ 前往健走賽介紹 walking.html
├─ 前往健康賽介紹 health.html
└─ 查看賽況 status.html

健走賽介紹頁 walking.html
└─ 查看健走賽賽況 status.html?contest=walking

健康賽介紹頁 health.html
├─ 查看男子健康賽賽況 status.html?contest=health-men
└─ 查看女子健康賽賽況 status.html?contest=health-women

賽況頁 status.html
├─ Tab 1：健走賽
├─ Tab 2：男子健康賽
└─ Tab 3：女子健康賽
```

設計決定：

- 賽況頁只做一個頁面：`status.html`
- 不採用「健康賽 tab 裡再切男女」的巢狀 tab
- 直接用三個 top-level tabs 呈現三個賽事：
  - 健走賽
  - 男子健康賽
  - 女子健康賽
- 可用 URL query 指定預設開啟的賽事：
  - `status.html?contest=walking`
  - `status.html?contest=health-men`
  - `status.html?contest=health-women`

## 3. 賽事分類

目前賽況頁視為三個並列賽事：

1. 健走賽
   - 男女混合
   - 以累計步數排名
2. 男子健康賽
   - 男子組獨立排名、獨立計分
3. 女子健康賽
   - 女子組獨立排名、獨立計分

目前已知：

- 兩個健康賽組別分別約 11 和 12 名參賽者
- 健走賽與健康賽都需要個人詳細資訊區域
- 參賽者公開顯示使用暱稱，不顯示真實姓名

## 4. CSV 與資料來源設計

資料來源預計來自 Google Sheet 發佈的 CSV。

原則：

- CSV 以方便裁判填寫為優先，因此內容會是未正規化資料
- 程式端負責 parsing、補缺漏、正規化、排序與計算
- 建議三個賽事拆成三份 CSV，避免不同賽事欄位混雜

建議資料檔：

```text
data/walking.csv
data/health-men.csv
data/health-women.csv
```

設定概念：

```js
const CONTESTS = {
  walking: {
    label: '健走賽',
    type: 'walking',
    csvUrl: './data/walking.csv',
  },
  healthMen: {
    label: '男子健康賽',
    type: 'health',
    csvUrl: './data/health-men.csv',
  },
  healthWomen: {
    label: '女子健康賽',
    type: 'health',
    csvUrl: './data/health-women.csv',
  },
};
```

## 5. 健走賽資料格式與規則

### 5.1 CSV 欄位

健走賽 CSV 預計提供：

- 參賽者編號
- 參賽者暱稱
- 週期編號
- 週期開始日期
- 週期結束日期
- 週期步數

原始資料型態概念：

```ts
type WalkingRawRow = {
  participantId: string;
  nickname: string;
  periodId: string;
  periodStartDate: string;
  periodEndDate: string;
  periodSteps: number;
};
```

正規化後資料型態概念：

```ts
type WalkingParticipant = {
  id: string;
  nickname: string;
  periods: {
    periodId: string;
    startDate: string;
    endDate: string;
    steps: number;
    cumulativeSteps: number;
  }[];
  totalSteps: number;
};
```

### 5.2 健走賽排名邏輯

- 以累計步數排名
- 缺少週期資料時，該週期視為 `0` 步
- 每個週期更新一次排名順序
- 長條圖依照累計步數排序
- 需要個人詳細資訊區域

### 5.3 步數攤分與無法整除問題

若需要把兩週期步數攤分到每日：

- 前面日期使用整數平均步數
- 最後一天補上剩餘差值
- 確保每日步數加總等於該週期步數

概念：

```js
const baseDailySteps = Math.floor(periodSteps / dayCount);
const remainder = periodSteps - baseDailySteps * dayCount;

// 前 dayCount - 1 天：baseDailySteps
// 最後一天：baseDailySteps + remainder
```

### 5.4 健走賽動畫

最新決定：

- 初版先不要播放 / 暫停 / 重播控制
- 頁面載入後自動依週期更新圖表
- 健走賽動畫速度先嘗試 `0.2 秒 / 週期`
- 速度要設計成容易透過 code 更改

建議設定：

```js
const STATUS_ANIMATION = {
  walkingPeriodIntervalMs: 200,
  healthPeriodIntervalMs: 1000,
};
```

## 6. 健走賽圖表與個人詳細資訊

### 6.1 主要圖表

健走賽主圖：

- 動態累計步數長條圖
- 每個週期更新一次
- 名次變化時長條順序重新排序
- 參賽者顏色保持一致

### 6.2 個人詳細資訊區

選擇某位參賽者後，建議顯示：

- 暱稱
- 目前排名
- 累計步數
- 本週期步數
- 平均每週期步數
- 最高單週期步數
- 與前一名差距
- 與下一名差距
- 歷週期步數圖表

## 7. 健康賽資料格式與規則

### 7.1 CSV 欄位

健康賽男女組共用同一種 CSV 格式，但資料來源分開：

- `health-men.csv`
- `health-women.csv`

CSV 預計提供：

- 參賽者編號
- 參賽者暱稱
- 週期編號
- 週期開始日期
- 週期結束日期
- 體重減少率
- 體脂肪減少率
- 骨骼肌增加率
- 累計體重減少率
- 累計體脂肪減少率
- 累計骨骼肌增加率
- 額外積分

重要決定：

- 健康賽的累計差值由 CSV 額外提供
- 程式不需要從每期變化率反推累積變化率
- 這樣可以避免百分比定義不一致造成誤差，也能節省計算邏輯

原始資料型態概念：

```ts
type HealthRawRow = {
  participantId: string;
  nickname: string;
  periodId: string;
  periodStartDate: string;
  periodEndDate: string;
  weightLossPercent: number;
  bodyFatLossPercent: number;
  skeletalMuscleGainPercent: number;
  cumulativeWeightLossPercent: number;
  cumulativeBodyFatLossPercent: number;
  cumulativeSkeletalMuscleGainPercent: number;
  extraPoints: number;
};
```

### 7.2 健康賽計分

CSV 不提供基本積分 / 排名積分。

程式需要計算：

- 加權健康百分比
- 每週期排名
- 每週期排名積分
- 每週期額外積分
- 每位參賽者累計總積分

目前活動規則中的加權公式：

```text
加權結果 = 體重減少率 * 30% + 體脂肪減少率 * 50% + 骨骼肌增加率 * 20%
```

建議用設定檔管理權重：

```js
const HEALTH_SCORE_CONFIG = {
  weightLossWeight: 0.3,
  bodyFatLossWeight: 0.5,
  skeletalMuscleGainWeight: 0.2,
};
```

排名積分規則依活動文件：

- 加權結果排名最後一名得 1 分
- 第一名得「參賽者人數 + 1」分
- 中間名次依序遞減

可由參賽者數量動態產生，例如 12 人：

```text
第 1 名：13 分
第 2 名：12 分
...
第 12 名：1 分
```

## 8. 健康賽圖表設計

每個健康賽 tab 內包含：

1. 積分長條圖
2. 加權百分比線圖
3. 個人詳細資訊區
4. 個人三項累計變化量線圖

### 8.1 積分長條圖

用途：呈現每位參賽者的積分狀態。

設計：

- 動態方式：每秒更新一個週期，即每秒跑過兩週
- 長條圖依照總積分重新排序
- 每個週期有兩種積分：
  - 排名積分
  - 額外積分
- 可用不同填滿樣式區分：
  - 排名積分：實心
  - 額外積分：斜線、點狀、半透明或不同紋理
- 同一參賽者在所有健康賽圖表中使用相同顏色

### 8.2 加權百分比線圖

用途：呈現所有參賽者每個週期的加權健康百分比。

設計：

- 只畫加權後的百分比值
- 不同參賽者用不同顏色
- 同一參賽者顏色要與積分長條圖一致
- 不要把體重、體脂肪、骨骼肌、額外積分等細項全部塞入這張總覽圖，以免太亂

### 8.3 個人詳細資訊區

選擇某位參賽者後，建議顯示：

- 暱稱
- 目前排名
- 目前總積分
- 排名積分累計
- 額外積分累計
- 本週期加權百分比
- 累計體重減少率
- 累計體脂肪減少率
- 累計骨骼肌增加率
- 歷週期積分明細

### 8.4 個人三項累計變化量線圖

個人詳細資訊區中另放一張線圖：

- X 軸：週期
- Y 軸：累計變化百分比
- 線 1：累計體重減少率
- 線 2：累計體脂肪減少率
- 線 3：累計骨骼肌增加率

資料直接使用 CSV 提供的累計欄位，不由程式反推。

## 9. 共用實作原則

### 9.1 資料處理流程

```text
Google Sheet CSV
        ↓
原始資料 parser
        ↓
資料正規化 / 補週期 / 補缺漏
        ↓
計算累計值、排名、積分、加權百分比
        ↓
圖表資料格式
        ↓
賽況頁 UI
```

### 9.2 圖表顏色

- 同一賽事中，同一參賽者顏色保持一致
- 健康賽中，同一參賽者在積分長條圖、加權百分比線圖、個人詳細資訊圖中顏色一致
- 男子健康賽與女子健康賽可各自產生色盤，不需要跨組保持同一 ID 顏色，除非資料上有跨組比較需求

### 9.3 設定集中管理

建議將容易調整的規則集中到設定：

```js
const STATUS_CONFIG = {
  animation: {
    walkingPeriodIntervalMs: 200,
    healthPeriodIntervalMs: 1000,
  },
  healthScore: {
    weightLossWeight: 0.3,
    bodyFatLossWeight: 0.5,
    skeletalMuscleGainWeight: 0.2,
  },
};
```

### 9.4 暫不做的功能

初版暫不做：

- 播放 / 暫停 / 重播控制
- 複雜互動式時間軸
- 健康賽男女組內層 tab
- 從週期變化率反推健康賽累積變化率

未來可追加：

- 播放控制
- 指定週期切換
- 更完整的參賽者比較功能
- 下載圖表或匯出賽況摘要

## 10. Memory 清理建議

本文件已承接目前專案討論期間需要長期查閱的專案資訊。若確認內容無誤，Hermes memory 中與本專案細節高度重疊的條目可考慮移除或縮減，只保留專案路徑這類跨 session 導航資訊。
