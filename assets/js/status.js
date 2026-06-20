const STATUS_CONFIG = {
  contests: {
    walking: {
      label: "健走賽",
      type: "walking",
      fileName: "walking.csv",
      csvUrl:
        "https://docs.google.com/spreadsheets/d/e/2PACX-1vQ8IDOe31TcOdmiZzNFZTpP5yWvHzVZgKw8zLaVIw2eVYsS2eU885ezWiEq9rJwGVFgnf2QLJL-3wZt/pub?gid=1203775995&single=true&output=csv",
      intervalMs: 200,
      description: "男女混合排名賽，依每週累計步數排序。",
    },
    "health-men": {
      label: "男子健康賽",
      type: "health",
      fileName: "health-men.csv",
      csvUrl:
        "https://docs.google.com/spreadsheets/d/e/2PACX-1vRH7pAHt8WWfzzGX_QaFv9NcVeSpSGZxFgIbZJR2WWouI4NwiZEbMK7WP5IWFQl_CLw0fKd4LIhVyIs/pub?gid=988507407&single=true&output=csv",
      intervalMs: 1000,
      description: "男子組獨立排名，依身體數據加權結果計算排名積分並加總額外積分。",
    },
    "health-women": {
      label: "女子健康賽",
      type: "health",
      fileName: "health-women.csv",
      csvUrl:
        "https://docs.google.com/spreadsheets/d/e/2PACX-1vQLV4wtCZ7uGdAoGhXlOfIiZ_hVt_N-DntdrFiEOzWTODs8dyHyf7mZPE-cxlPIqJ2714OXIiePLUnG/pub?gid=1437785710&single=true&output=csv",
      intervalMs: 1000,
      description: "女子組獨立排名，依身體數據加權結果計算排名積分並加總額外積分。",
    },
  },
  localScenarios: ["complete", "partial-missing", "participant-missing"],
  requiredHeaders: {
    walking: [
      "參賽者編號",
      "參賽者暱稱",
      "週期編號",
      "週期開始日期",
      "週期結束日期",
      "是否有效",
      "周步數",
    ],
    health: [
      "參賽者編號",
      "參賽者暱稱",
      "量測日期",
      "量測編號",
      "是否有效",
      "額外積分",
      "體重減少率",
      "體脂肪減少率",
      "骨骼肌增加率",
      "累計體重減少率",
      "累計體脂肪減少率",
      "累計骨骼肌增加率",
    ],
  },
  healthScore: {
    weightLossWeight: 0.3,
    bodyFatLossWeight: 0.5,
    skeletalMuscleGainWeight: 0.2,
  },
  colors: [
    "#168bd7",
    "#86c440",
    "#e67b50",
    "#8b5cf6",
    "#06b6d4",
    "#f59e0b",
    "#10b981",
    "#ef4444",
    "#6366f1",
    "#14b8a6",
    "#ec4899",
    "#84cc16",
    "#0ea5e9",
    "#a855f7",
    "#f97316",
    "#22c55e",
    "#64748b",
    "#d946ef",
    "#dc2626",
    "#2563eb",
    "#65a30d",
    "#9333ea",
    "#0891b2",
    "#ca8a04",
    "#be185d",
    "#0f766e",
    "#7c3aed",
  ],
};

const app = document.querySelector("[data-status-app]");
const sourceSettings = getSourceSettings();
const state = {
  activeContest: getInitialContest(),
  dataCache: new Map(),
  timer: null,
  selectedParticipantId: null,
  currentFrame: 0,
  requestId: 0,
  abortController: null,
  charts: {
    walking: null,
    healthScore: null,
    healthWeighted: null,
    detailDelta: null,
  },
};

const els = {
  tabs: document.querySelectorAll("[data-contest-tab]"),
  title: document.querySelector("[data-contest-title]"),
  type: document.querySelector("[data-contest-type]"),
  description: document.querySelector("[data-contest-description]"),
  sourceNote: document.querySelector("[data-source-note]"),
  currentPeriod: document.querySelector("[data-current-period]"),
  currentRange: document.querySelector("[data-current-range]"),
  error: document.querySelector("[data-status-error]"),
  notice: document.querySelector("[data-status-notice]"),
  walkingPanel: document.querySelector("[data-walking-panel]"),
  walkingChart: document.querySelector("[data-walking-chart]"),
  walkingFrame: document.querySelector("[data-walking-frame]"),
  walkingParticipants: document.querySelector("[data-walking-participants]"),
  walkingDetail: document.querySelector("[data-walking-detail]"),
  healthPanel: document.querySelector("[data-health-panel]"),
  healthScoreChart: document.querySelector("[data-health-score-chart]"),
  healthFrame: document.querySelector("[data-health-frame]"),
  healthWeightedChart: document.querySelector("[data-health-weighted-chart]"),
  healthParticipants: document.querySelector("[data-health-participants]"),
  healthDetail: document.querySelector("[data-health-detail]"),
};

if (app) {
  initStatusPage();
}

function initStatusPage() {
  els.tabs.forEach((tab) => {
    tab.addEventListener("click", () => setActiveContest(tab.dataset.contestTab));
  });

  window.addEventListener("resize", () => {
    Object.values(state.charts).forEach((chart) => chart?.resize());
  });

  updateSourceNote();
  setActiveContest(state.activeContest);
}

function getSourceSettings() {
  const params = new URLSearchParams(window.location.search);
  const source = params.get("source") === "local" ? "local" : "google";
  const scenario = params.get("scenario") || "complete";

  return {
    source,
    scenario,
    scenarioIsValid: STATUS_CONFIG.localScenarios.includes(scenario),
  };
}

function getInitialContest() {
  const params = new URLSearchParams(window.location.search);
  const contest = params.get("contest") || "walking";
  return STATUS_CONFIG.contests[contest] ? contest : "walking";
}

function updateSourceNote() {
  if (!els.sourceNote) return;
  if (sourceSettings.source === "local") {
    els.sourceNote.hidden = false;
    els.sourceNote.textContent = `本機測試資料｜${sourceSettings.scenario}`;
    return;
  }
  els.sourceNote.hidden = true;
}

async function setActiveContest(contestKey) {
  const contest = STATUS_CONFIG.contests[contestKey];
  if (!contest) return;

  stopAnimation();
  state.abortController?.abort();
  state.activeContest = contestKey;
  state.selectedParticipantId = null;
  state.currentFrame = 0;
  updateUrlContest(contestKey);
  updateTabState(contestKey);
  setLoading(contest);

  const requestId = ++state.requestId;
  state.abortController = new AbortController();

  try {
    const data = await loadContestData(contestKey, contest, state.abortController.signal);
    if (requestId !== state.requestId || contestKey !== state.activeContest) return;

    state.selectedParticipantId = data.participants[0]?.id || null;
    if (!data.visibleFrames.length) {
      renderNotStarted(contest, data);
      return;
    }

    if (contest.type === "walking") {
      renderWalking(data, 0);
      startAnimation(contest.intervalMs, data.visibleFrames.length, (frame) =>
        renderWalking(data, frame),
      );
    } else {
      renderHealth(data, 0);
      startAnimation(contest.intervalMs, data.visibleFrames.length, (frame) =>
        renderHealth(data, frame),
      );
    }
  } catch (error) {
    if (error.name !== "AbortError" && requestId === state.requestId) {
      showError(error);
    }
  }
}

function updateUrlContest(contestKey) {
  const url = new URL(window.location.href);
  url.searchParams.set("contest", contestKey);
  window.history.replaceState({}, "", url);
}

function updateTabState(contestKey) {
  els.tabs.forEach((tab) => {
    const isActive = tab.dataset.contestTab === contestKey;
    tab.classList.toggle("active", isActive);
    tab.setAttribute("aria-selected", String(isActive));
  });
}

function setLoading(contest) {
  hideMessages();
  els.walkingPanel.hidden = true;
  els.healthPanel.hidden = true;
  els.title.textContent = `${contest.label}載入中...`;
  els.type.textContent = contest.type === "walking" ? "健走資料" : "健康資料";
  els.description.textContent = contest.description;
  els.currentPeriod.textContent = "--";
  els.currentRange.textContent = "CSV 載入中";
}

function hideMessages() {
  els.error.hidden = true;
  if (els.notice) els.notice.hidden = true;
}

async function loadContestData(contestKey, contest, signal) {
  const cacheKey = `${sourceSettings.source}:${sourceSettings.scenario}:${contestKey}`;
  if (state.dataCache.has(cacheKey)) {
    return state.dataCache.get(cacheKey);
  }

  const csvUrl = resolveCsvUrl(contest);
  const response = await fetch(csvUrl, {
    cache: sourceSettings.source === "google" ? "no-store" : "default",
    signal,
  });
  if (!response.ok) {
    throw new Error(`無法讀取 ${csvUrl}（HTTP ${response.status}）`);
  }

  const parsed = await parseCsv(await response.text());
  validateHeaders(parsed.fields, contest.type);
  const today = getTaipeiToday();
  const data =
    contest.type === "walking"
      ? normalizeWalking(parsed.rows, today)
      : normalizeHealth(parsed.rows, today);

  state.dataCache.set(cacheKey, data);
  return data;
}

function resolveCsvUrl(contest) {
  if (sourceSettings.source !== "local") return contest.csvUrl;
  if (!sourceSettings.scenarioIsValid) {
    throw new Error(
      `未知的本機測試情境「${sourceSettings.scenario}」。可用情境：${STATUS_CONFIG.localScenarios.join("、")}`,
    );
  }
  return `./data/scenarios/${sourceSettings.scenario}/${contest.fileName}`;
}

function parseCsv(csvText) {
  return new Promise((resolve, reject) => {
    Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.replace(/^\ufeff/, "").trim(),
      complete: (results) => {
        if (results.errors.some((error) => error.type === "Quotes")) {
          reject(new Error("CSV 格式錯誤，請檢查引號與欄位內容。"));
          return;
        }
        resolve({
          rows: results.data.filter(hasAnyCsvValue),
          fields: results.meta.fields || [],
        });
      },
      error: reject,
    });
  });
}

function validateHeaders(fields, type) {
  const missing = STATUS_CONFIG.requiredHeaders[type].filter((header) => !fields.includes(header));
  if (missing.length) {
    throw new Error(`CSV 缺少必要欄位：${missing.join("、")}`);
  }
}

function normalizeWalking(rows, today) {
  const roster = collectRoster(rows);
  const knownTimeline = collectWalkingTimeline(rows);
  const records = collectLatestRecords(rows, "週期編號");
  warnInvalidEffectiveRecords(records, "walking");
  const visiblePeriods = knownTimeline.filter(
    (period) => compareDateKeys(period.startDate, today) <= 0,
  );
  const visibleFrames = visiblePeriods.flatMap((period) =>
    expandVisiblePeriodDays(period, today),
  );

  const participants = roster.map((person, index) => {
    let cumulativeSteps = 0;
    const periodMap = new Map();
    const hasAnyData = knownTimeline.some((period) => {
      const row = records.get(makeRecordKey(person.id, period.periodId));
      return isEffectiveRow(row) && readFiniteNumber(row, "周步數") !== null;
    });

    visiblePeriods.forEach((period) => {
      const row = records.get(makeRecordKey(person.id, period.periodId));
      const parsedSteps = readFiniteNumber(row, "周步數");
      const hasData = Boolean(row && isEffectiveRow(row) && parsedSteps !== null);
      const steps = hasData ? parsedSteps : 0;
      const periodDays = expandVisiblePeriodDays(period, today);
      const allPeriodDays = expandAllPeriodDays(period);
      const dailySteps = distributeSteps(steps, allPeriodDays.length);
      const visibleDailySteps = dailySteps.slice(0, periodDays.length);
      const periodStartCumulative = cumulativeSteps;

      const dailyFrames = periodDays.map((day, dayIndex) => {
        cumulativeSteps += visibleDailySteps[dayIndex] || 0;
        return {
          ...day,
          steps: visibleDailySteps[dayIndex] || 0,
          periodSteps: steps,
          cumulativeSteps,
          hasData,
        };
      });

      periodMap.set(period.periodId, {
        ...period,
        steps,
        hasData,
        periodStartCumulative,
        cumulativeSteps,
        dailyFrames,
      });
    });

    return {
      ...person,
      color: STATUS_CONFIG.colors[index % STATUS_CONFIG.colors.length],
      periods: visiblePeriods.map((period) => periodMap.get(period.periodId)),
      dailyFrames: visiblePeriods.flatMap(
        (period) => periodMap.get(period.periodId)?.dailyFrames || [],
      ),
      totalSteps: cumulativeSteps,
      hasAnyData,
    };
  });

  return {
    type: "walking",
    participants,
    knownTimeline,
    visiblePeriods,
    visibleFrames,
  };
}

function normalizeHealth(rows, today) {
  const roster = collectRoster(rows);
  const knownTimeline = collectHealthTimeline(rows);
  const visibleFrames = knownTimeline.filter(
    (measurement) => compareDateKeys(measurement.measurementDate, today) <= 0,
  );
  const records = collectLatestRecords(rows, "量測編號");
  warnInvalidEffectiveRecords(records, "health");
  const rankingByMeasurement = new Map();

  visibleFrames.forEach((measurement) => {
    const candidates = roster
      .map((person) => {
        const row = records.get(makeRecordKey(person.id, measurement.measurementId));
        const metrics = readHealthMetrics(row);
        const hasData = Boolean(row && isEffectiveRow(row) && metrics);
        return {
          id: person.id,
          nickname: person.nickname,
          hasData,
          weightedPercent: hasData ? calculateWeightedPercent(metrics) : null,
        };
      })
      .filter((item) => item.hasData)
      .sort(
        (a, b) =>
          b.weightedPercent - a.weightedPercent ||
          a.nickname.localeCompare(b.nickname, "zh-Hant"),
      );

    rankingByMeasurement.set(
      measurement.measurementId,
      new Map(
        candidates.map((item, index) => [
          item.id,
          {
            rank: index + 1,
            rankingPoints: calculateRankingPoints(index, roster.length),
          },
        ]),
      ),
    );
  });

  const participants = roster.map((person, index) => {
    let rankingPointsTotal = 0;
    let extraPointsTotal = 0;
    const hasAnyData = knownTimeline.some((measurement) => {
      const row = records.get(makeRecordKey(person.id, measurement.measurementId));
      return isEffectiveRow(row) && Boolean(readHealthMetrics(row));
    });

    const measurements = visibleFrames.map((measurement) => {
      const row = records.get(makeRecordKey(person.id, measurement.measurementId));
      const metrics = readHealthMetrics(row);
      const hasData = Boolean(row && isEffectiveRow(row) && metrics);
      const ranking = rankingByMeasurement.get(measurement.measurementId).get(person.id);
      const extraPoints = hasData ? readFiniteNumber(row, "額外積分") || 0 : 0;
      const rankingPoints = hasData ? ranking?.rankingPoints || 0 : 0;

      rankingPointsTotal += rankingPoints;
      extraPointsTotal += extraPoints;

      return {
        ...measurement,
        hasData,
        weightLossPercent: hasData ? metrics.weightLossPercent : null,
        bodyFatLossPercent: hasData ? metrics.bodyFatLossPercent : null,
        skeletalMuscleGainPercent: hasData ? metrics.skeletalMuscleGainPercent : null,
        cumulativeWeightLossPercent: hasData ? metrics.cumulativeWeightLossPercent : null,
        cumulativeBodyFatLossPercent: hasData ? metrics.cumulativeBodyFatLossPercent : null,
        cumulativeSkeletalMuscleGainPercent: hasData
          ? metrics.cumulativeSkeletalMuscleGainPercent
          : null,
        weightedPercent: hasData ? calculateWeightedPercent(metrics) : null,
        rankingPoints,
        extraPoints,
        rankingPointsTotal,
        extraPointsTotal,
        totalPoints: rankingPointsTotal + extraPointsTotal,
        rank: hasData ? ranking?.rank || null : null,
      };
    });

    return {
      ...person,
      color: STATUS_CONFIG.colors[index % STATUS_CONFIG.colors.length],
      measurements,
      rankingPointsTotal,
      extraPointsTotal,
      totalPoints: rankingPointsTotal + extraPointsTotal,
      hasAnyData,
    };
  });

  return {
    type: "health",
    participants,
    knownTimeline,
    visibleFrames,
  };
}

function collectRoster(rows) {
  const map = new Map();
  rows.forEach((row) => {
    const id = readText(row, "參賽者編號");
    if (!id) return;
    const nickname = readText(row, "參賽者暱稱");
    const existing = map.get(id);
    if (existing && nickname && existing.nickname !== nickname) {
      console.warn(`參賽者 ${id} 的暱稱不一致，採用最後一個非空值「${nickname}」。`);
    }
    map.set(id, { id, nickname: nickname || existing?.nickname || id });
  });

  return Array.from(map.values()).sort((a, b) => naturalOrder(a.id, b.id));
}

function collectWalkingTimeline(rows) {
  const map = new Map();
  rows.forEach((row) => {
    const periodId = readText(row, "週期編號");
    const startDate = normalizeDateText(readText(row, "週期開始日期"));
    const endDate = normalizeDateText(readText(row, "週期結束日期"));
    if (!periodId || !startDate || !endDate) return;
    map.set(periodId, { periodId, startDate, endDate });
  });
  return Array.from(map.values()).sort(
    (a, b) =>
      compareDateKeys(a.startDate, b.startDate) || naturalOrder(a.periodId, b.periodId),
  );
}

function collectHealthTimeline(rows) {
  const map = new Map();
  rows.forEach((row) => {
    const measurementId = readText(row, "量測編號");
    const measurementDate = normalizeDateText(readText(row, "量測日期"));
    if (!measurementId || !measurementDate) return;
    map.set(measurementId, { measurementId, measurementDate });
  });
  return Array.from(map.values()).sort(
    (a, b) =>
      compareDateKeys(a.measurementDate, b.measurementDate) ||
      naturalOrder(a.measurementId, b.measurementId),
  );
}

function collectLatestRecords(rows, timeKey) {
  const map = new Map();
  rows.forEach((row) => {
    const participantId = readText(row, "參賽者編號");
    const timeId = readText(row, timeKey);
    if (!participantId || !timeId) return;
    const key = makeRecordKey(participantId, timeId);
    if (map.has(key)) {
      console.warn(`CSV 有重複紀錄 ${participantId} / ${timeId}，採用最後一列。`);
    }
    map.set(key, row);
  });
  return map;
}

function makeRecordKey(participantId, timeId) {
  return `${participantId}\u0000${timeId}`;
}

function warnInvalidEffectiveRecords(records, type) {
  records.forEach((row) => {
    if (!isEffectiveRow(row)) return;
    const participantId = readText(row, "參賽者編號");
    const timeId = readText(row, type === "walking" ? "週期編號" : "量測編號");
    const isValid =
      type === "walking"
        ? readFiniteNumber(row, "周步數") !== null
        : Boolean(readHealthMetrics(row));
    if (!isValid) {
      console.warn(
        `參賽者 ${participantId} 的${type === "walking" ? "週期" : "量測"} ${timeId} 標記為有效，但必要數值為空或公式錯誤；本筆按缺漏資料處理。`,
      );
    }
  });
}

function readHealthMetrics(row) {
  if (!row) return null;
  const values = {
    weightLossPercent: readFiniteNumber(row, "體重減少率"),
    bodyFatLossPercent: readFiniteNumber(row, "體脂肪減少率"),
    skeletalMuscleGainPercent: readFiniteNumber(row, "骨骼肌增加率"),
    cumulativeWeightLossPercent: readFiniteNumber(row, "累計體重減少率"),
    cumulativeBodyFatLossPercent: readFiniteNumber(row, "累計體脂肪減少率"),
    cumulativeSkeletalMuscleGainPercent: readFiniteNumber(row, "累計骨骼肌增加率"),
  };
  return Object.values(values).every((value) => value !== null) ? values : null;
}

function calculateWeightedPercent(metrics) {
  const weights = STATUS_CONFIG.healthScore;
  return (
    metrics.weightLossPercent * weights.weightLossWeight +
    metrics.bodyFatLossPercent * weights.bodyFatLossWeight +
    metrics.skeletalMuscleGainPercent * weights.skeletalMuscleGainWeight
  );
}

function calculateRankingPoints(rankIndex, participantCount) {
  return Math.max(participantCount - rankIndex, 0);
}

function expandVisiblePeriodDays(period, today) {
  const endDate =
    compareDateKeys(period.endDate, today) > 0 ? parseDateKey(today) : parseDateKey(period.endDate);
  return expandDateRange(period, endDate);
}

function expandAllPeriodDays(period) {
  return expandDateRange(period, parseDateKey(period.endDate));
}

function expandDateRange(period, endDate) {
  const startDate = parseDateKey(period.startDate);
  const dayCount = Math.max(Math.round((endDate - startDate) / 86400000) + 1, 0);
  const fullDayCount =
    Math.max(
      Math.round((parseDateKey(period.endDate) - parseDateKey(period.startDate)) / 86400000) + 1,
      1,
    ) || 1;

  return Array.from({ length: dayCount }, (_, index) => {
    const current = new Date(startDate);
    current.setUTCDate(startDate.getUTCDate() + index);
    return {
      periodId: period.periodId,
      startDate: period.startDate,
      endDate: period.endDate,
      date: formatDateKey(current),
      dayIndex: index + 1,
      dayCount: fullDayCount,
    };
  });
}

function distributeSteps(periodSteps, dayCount) {
  const baseSteps = Math.floor(periodSteps / dayCount);
  const remainder = periodSteps - baseSteps * dayCount;
  return Array.from({ length: dayCount }, (_, index) =>
    index === dayCount - 1 ? baseSteps + remainder : baseSteps,
  );
}

function getTaipeiToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}/${values.month}/${values.day}`;
}

function normalizeDateText(value) {
  const match = String(value).trim().match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (!match) return "";
  return `${match[1]}/${match[2].padStart(2, "0")}/${match[3].padStart(2, "0")}`;
}

function parseDateKey(value) {
  const [year, month, day] = value.split("/").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatDateKey(value) {
  return `${value.getUTCFullYear()}/${String(value.getUTCMonth() + 1).padStart(2, "0")}/${String(value.getUTCDate()).padStart(2, "0")}`;
}

function compareDateKeys(a, b) {
  return a.localeCompare(b);
}

function naturalOrder(a, b) {
  const aNumber = Number(String(a).match(/\d+/)?.[0] || 0);
  const bNumber = Number(String(b).match(/\d+/)?.[0] || 0);
  return aNumber - bNumber || String(a).localeCompare(String(b), "zh-Hant");
}

function isEffectiveRow(row) {
  return readText(row, "是否有效") === "是";
}

function startAnimation(intervalMs, frameCount, render) {
  if (frameCount <= 1) return;
  let frame = 0;
  state.timer = window.setInterval(() => {
    frame += 1;
    if (frame >= frameCount) {
      stopAnimation();
      return;
    }
    render(frame);
  }, intervalMs);
}

function stopAnimation() {
  window.clearInterval(state.timer);
  state.timer = null;
}

function renderNotStarted(contest, data) {
  stopAnimation();
  hideMessages();
  els.title.textContent = contest.label;
  els.type.textContent = contest.type === "walking" ? "步數排名" : "健康積分";
  els.description.textContent = contest.description;
  els.currentPeriod.textContent = "尚未開始";
  els.currentRange.textContent = "目前沒有已到達日期的賽事資料";
  showNotice(`已載入 ${data.participants.length} 位參賽者，第一個賽事日期尚未到達。`);
}

function renderWalking(data, frame) {
  const contest = STATUS_CONFIG.contests[state.activeContest];
  const day = data.visibleFrames[frame];
  const ranked = getWalkingRanked(data, frame);

  state.currentFrame = frame;
  ensureSelectedParticipant(data.participants);
  hideMessages();
  updateSummary(contest, day);
  els.walkingPanel.hidden = false;
  els.healthPanel.hidden = true;
  els.walkingFrame.textContent = `第 ${frame + 1} 天 / ${data.visibleFrames.length} 天`;
  els.walkingParticipants.innerHTML = renderParticipantButtons(data.participants, "walking");
  els.walkingDetail.innerHTML = renderWalkingDetail(data, ranked, frame);
  renderWalkingChart(ranked, frame);
  bindParticipantButtons();

  if (!ranked.some((participant) => participant.current.hasData)) {
    showNotice("本日所屬週期目前無人提供有效資料，所有參賽者均顯示為未排名。");
  }
}

function getWalkingRanked(data, frame) {
  return data.participants
    .map((participant) => ({
      ...participant,
      current: participant.dailyFrames[frame],
    }))
    .sort(
      (a, b) =>
        Number(b.current.hasData) - Number(a.current.hasData) ||
        b.current.cumulativeSteps - a.current.cumulativeSteps ||
        naturalOrder(a.id, b.id),
    );
}

function renderWalkingChart(ranked, frame) {
  const chart = getChart("walking", els.walkingChart);
  const labels = ranked.map((participant) => participant.nickname);
  const values = ranked.map((participant) => ({
    value: participant.current.cumulativeSteps,
    id: participant.id,
    itemStyle: {
      color: participant.current.hasData ? participant.color : "#cbd5dc",
      opacity: participant.current.hasData ? 1 : 0.65,
    },
    label:
      participant.current.cumulativeSteps === 0
        ? {
            position: "right",
            color: participant.current.hasData ? participant.color : "#78909d",
            textShadowBlur: 0,
          }
        : undefined,
  }));

  chart.setOption(
    {
      animationDuration: 250,
      animationDurationUpdate: 450,
      grid: { top: 12, right: 12, bottom: 18, left: 12 },
      tooltip: {
        trigger: "item",
        formatter: (params) => {
          const participant = ranked[params.dataIndex];
          const status = participant.current.hasData ? "" : "<br/>本週未提供資料";
          return `${escapeHtml(params.name)}<br/>累計：${formatNumber(params.value)} 步${status}`;
        },
      },
      xAxis: {
        type: "value",
        axisLabel: { show: false },
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { show: false },
      },
      yAxis: {
        type: "category",
        inverse: true,
        data: labels,
        axisLabel: { show: false },
        axisLine: { show: false },
        axisTick: { show: false },
      },
      series: [
        {
          type: "bar",
          data: values,
          realtimeSort: true,
          barMaxWidth: 30,
          label: {
            show: true,
            position: "insideLeft",
            formatter: (params) => {
              const participant = ranked[params.dataIndex];
              const suffix = participant.current.hasData ? `${formatCompactNumber(params.value)} 步` : "未提供";
              return `${participant.nickname}｜${suffix}`;
            },
            color: "white",
            fontWeight: 900,
            padding: [0, 0, 0, 8],
            textShadowBlur: 4,
            textShadowColor: "rgba(0,0,0,0.35)",
          },
          universalTransition: true,
        },
      ],
    },
    true,
  );

  replaceChartClick(chart, (params) => {
    state.selectedParticipantId = params.data.id;
    renderWalking(getCachedActiveData(), frame);
  });
}

function renderWalkingDetail(data, ranked, frame) {
  const participant =
    data.participants.find((item) => item.id === state.selectedParticipantId) || ranked[0];
  if (!participant) return "<p>尚無參賽者資料。</p>";

  const current = participant.dailyFrames[frame];
  const rankedWithData = ranked.filter((item) => item.current.hasData);
  const rankIndex = rankedWithData.findIndex((item) => item.id === participant.id);
  const rank = rankIndex >= 0 ? rankIndex + 1 : null;
  const previous = rankIndex > 0 ? rankedWithData[rankIndex - 1] : null;
  const next = rankIndex >= 0 ? rankedWithData[rankIndex + 1] : null;
  const periodFrame = participant.periods.find(
    (period) => period.periodId === current.periodId,
  );
  const availableDays = participant.dailyFrames
    .slice(0, frame + 1)
    .filter((item) => item.hasData);
  const bestDay = availableDays.reduce(
    (best, item) => (!best || item.steps > best.steps ? item : best),
    null,
  );
  const status = !participant.hasAnyData
    ? "尚無任何有效資料"
    : current.hasData
      ? "有效資料"
      : "本週未提供資料";

  return `
    ${renderDetailHeading(participant, rank ? `目前第 ${rank} 名｜${current.date}` : `未排名｜${current.date}`, status)}
    <div class="metric-grid">
      ${renderMetric("資料狀態", status)}
      ${renderMetric("累計步數", `${formatNumber(current.cumulativeSteps)} 步`)}
      ${renderMetric("今日步數", current.hasData ? `${formatNumber(current.steps)} 步` : "--")}
      ${renderMetric("本週期累計", current.hasData ? `${formatNumber(current.cumulativeSteps - periodFrame.periodStartCumulative)} 步` : "--")}
      ${renderMetric("本週期總步數", current.hasData ? `${formatNumber(periodFrame.steps)} 步` : "--")}
      ${renderMetric("最高單日", bestDay ? `${formatNumber(bestDay.steps)} 步` : "--")}
      ${renderMetric("與前一名差距", previous ? `${formatNumber(previous.current.cumulativeSteps - current.cumulativeSteps)} 步` : "--")}
      ${renderMetric("與下一名差距", next ? `${formatNumber(current.cumulativeSteps - next.current.cumulativeSteps)} 步` : "--")}
    </div>
  `;
}

function renderHealth(data, frame) {
  const contest = STATUS_CONFIG.contests[state.activeContest];
  const measurement = data.visibleFrames[frame];
  const ranked = getHealthRanked(data, frame);

  state.currentFrame = frame;
  ensureSelectedParticipant(data.participants);
  hideMessages();
  updateSummary(contest, measurement);
  els.walkingPanel.hidden = true;
  els.healthPanel.hidden = false;
  els.healthFrame.textContent = `量測 ${frame + 1} / ${data.visibleFrames.length}`;
  els.healthParticipants.innerHTML = renderParticipantButtons(data.participants, "health");
  els.healthDetail.innerHTML = renderHealthDetail(data, ranked, frame);
  renderHealthScoreChart(ranked, frame);
  renderHealthWeightedChart(data, frame);
  renderDetailDeltaChart(data, frame);
  bindParticipantButtons();

  if (!ranked.some((participant) => participant.current.hasData)) {
    showNotice("本次量測無人提供有效資料，所有參賽者當期積分均為 0 分。");
  }
}

function getHealthRanked(data, frame) {
  return data.participants
    .map((participant) => ({
      ...participant,
      current: participant.measurements[frame],
    }))
    .sort(
      (a, b) =>
        Number(b.current.hasData) - Number(a.current.hasData) ||
        b.current.totalPoints - a.current.totalPoints ||
        (b.current.weightedPercent ?? -Infinity) - (a.current.weightedPercent ?? -Infinity) ||
        naturalOrder(a.id, b.id),
    );
}

function renderHealthScoreChart(ranked, frame) {
  const chart = getChart("healthScore", els.healthScoreChart);
  const labels = ranked.map((participant) => participant.nickname);

  chart.setOption(
    {
      animationDuration: 350,
      animationDurationUpdate: 650,
      grid: { top: 12, right: 12, bottom: 42, left: 12 },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: (params) => {
          const participant = ranked[params[0]?.dataIndex];
          if (!participant) return "";
          const status = participant.current.hasData ? "有效資料" : "未量測／未提供資料";
          return `${escapeHtml(participant.nickname)}<br/>${status}<br/>累計：${formatNumber(participant.current.totalPoints)} 分`;
        },
      },
      legend: { bottom: 0, data: ["排名積分", "額外積分"] },
      xAxis: {
        type: "value",
        axisLabel: { show: false },
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { show: false },
      },
      yAxis: {
        type: "category",
        inverse: true,
        data: labels,
        axisLabel: { show: false },
        axisLine: { show: false },
        axisTick: { show: false },
      },
      series: [
        {
          name: "排名積分",
          type: "bar",
          stack: "points",
          data: ranked.map((participant) => ({
            value: participant.current.rankingPointsTotal,
            id: participant.id,
            itemStyle: {
              color: participant.current.hasData ? participant.color : "#cbd5dc",
              opacity: participant.current.hasData ? 1 : 0.65,
            },
            label: participant.current.hasData
              ? undefined
              : {
                  position: "right",
                  color: "#78909d",
                  textShadowBlur: 0,
                },
          })),
          barMaxWidth: 30,
          label: {
            show: true,
            position: "insideLeft",
            formatter: (params) => {
              const participant = ranked[params.dataIndex];
              const suffix = participant.current.hasData
                ? `${formatNumber(participant.current.totalPoints)} 分`
                : "當期 0 分";
              return `${participant.nickname}｜${suffix}`;
            },
            color: "white",
            fontWeight: 900,
            padding: [0, 0, 0, 8],
            textShadowBlur: 4,
            textShadowColor: "rgba(0,0,0,0.35)",
          },
          universalTransition: true,
        },
        {
          name: "額外積分",
          type: "bar",
          stack: "points",
          data: ranked.map((participant) => ({
            value: participant.current.extraPointsTotal,
            id: participant.id,
            itemStyle: {
              color: participant.current.hasData ? participant.color : "#cbd5dc",
              opacity: participant.current.hasData ? 1 : 0.65,
              decal: participant.current.hasData
                ? {
                    symbol: "rect",
                    dashArrayX: [2, 2],
                    dashArrayY: [6, 4],
                    rotation: Math.PI / 4,
                    color: "rgba(255,255,255,0.55)",
                  }
                : null,
            },
          })),
          universalTransition: true,
        },
      ],
    },
    true,
  );

  replaceChartClick(chart, (params) => {
    state.selectedParticipantId = params.data.id;
    renderHealth(getCachedActiveData(), frame);
  });
}

function renderHealthWeightedChart(data, frame) {
  const chart = getChart("healthWeighted", els.healthWeightedChart);
  const measurements = data.visibleFrames
    .slice(0, frame + 1)
    .map((measurement) => measurement.measurementId);

  chart.setOption(
    {
      animationDurationUpdate: 450,
      grid: { top: 24, right: 26, bottom: 64, left: 48 },
      tooltip: {
        trigger: "axis",
        valueFormatter: (value) => (value === null ? "未量測" : `${formatDecimal(value)}%`),
      },
      legend: {
        type: "scroll",
        bottom: 0,
        data: data.participants.map((participant) => participant.nickname),
      },
      xAxis: { type: "category", data: measurements, boundaryGap: false },
      yAxis: {
        type: "value",
        axisLabel: { formatter: "{value}%" },
        splitLine: { lineStyle: { color: "#e6f0f4" } },
      },
      series: data.participants.map((participant) => ({
        id: participant.id,
        name: participant.nickname,
        type: "line",
        connectNulls: false,
        showSymbol: true,
        symbol: "circle",
        symbolSize: 8,
        emphasis: { focus: "series" },
        itemStyle: { color: participant.color },
        lineStyle: { color: participant.color, width: 2 },
        data: participant.measurements
          .slice(0, frame + 1)
          .map((measurement) => measurement.weightedPercent),
      })),
    },
    true,
  );

  replaceChartClick(chart, (params) => {
    const participant = data.participants.find((item) => item.id === params.seriesId);
    if (!participant) return;
    state.selectedParticipantId = participant.id;
    renderHealth(data, frame);
  });
}

function renderHealthDetail(data, ranked, frame) {
  const participant =
    data.participants.find((item) => item.id === state.selectedParticipantId) || ranked[0];
  if (!participant) return "<p>尚無參賽者資料。</p>";

  const current = participant.measurements[frame];
  const rankedWithData = ranked.filter((item) => item.current.hasData);
  const rankIndex = rankedWithData.findIndex((item) => item.id === participant.id);
  const rank = rankIndex >= 0 ? rankIndex + 1 : null;
  const status = !participant.hasAnyData
    ? "尚無任何有效資料"
    : current.hasData
      ? "有效資料"
      : "未量測／未提供資料，當期 0 分";

  return `
    ${renderDetailHeading(participant, rank ? `目前第 ${rank} 名｜${current.measurementDate}` : `未排名｜${current.measurementDate}`, status)}
    <div class="metric-grid">
      ${renderMetric("資料狀態", status)}
      ${renderMetric("總積分", `${formatNumber(current.totalPoints)} 分`)}
      ${renderMetric("排名積分", `${formatNumber(current.rankingPointsTotal)} 分`)}
      ${renderMetric("額外積分", `${formatNumber(current.extraPointsTotal)} 分`)}
      ${renderMetric("本期加權", current.hasData ? `${formatDecimal(current.weightedPercent)}%` : "--")}
      ${renderMetric("累計體重減少", formatOptionalPercent(current.cumulativeWeightLossPercent))}
      ${renderMetric("累計體脂減少", formatOptionalPercent(current.cumulativeBodyFatLossPercent))}
      ${renderMetric("累計骨骼肌增加", formatOptionalPercent(current.cumulativeSkeletalMuscleGainPercent))}
    </div>
  `;
}

function renderDetailDeltaChart(data, frame) {
  const container = document.querySelector("[data-detail-delta-chart]");
  if (!container) return;
  const participant = data.participants.find((item) => item.id === state.selectedParticipantId);
  if (!participant) return;

  const chart = getChart("detailDelta", container);
  chart.setOption(
    {
      animationDurationUpdate: 450,
      grid: { top: 24, right: 22, bottom: 30, left: 42 },
      tooltip: {
        trigger: "axis",
        valueFormatter: (value) => (value === null ? "未量測" : `${formatDecimal(value)}%`),
      },
      legend: { top: 0, data: ["體重", "體脂肪", "骨骼肌"] },
      xAxis: {
        type: "category",
        data: data.visibleFrames.map((measurement) => measurement.measurementId),
        boundaryGap: false,
      },
      yAxis: {
        type: "value",
        axisLabel: { formatter: "{value}%" },
        splitLine: { lineStyle: { color: "#e6f0f4" } },
      },
      series: [
        makeDetailSeries(
          "體重",
          "#168bd7",
          participant.measurements,
          frame,
          "cumulativeWeightLossPercent",
        ),
        makeDetailSeries(
          "體脂肪",
          "#86c440",
          participant.measurements,
          frame,
          "cumulativeBodyFatLossPercent",
        ),
        makeDetailSeries(
          "骨骼肌",
          "#e67b50",
          participant.measurements,
          frame,
          "cumulativeSkeletalMuscleGainPercent",
        ),
      ],
    },
    true,
  );
}

function makeDetailSeries(name, color, measurements, frame, key) {
  return {
    name,
    type: "line",
    connectNulls: false,
    showSymbol: true,
    symbolSize: 9,
    itemStyle: { color },
    data: measurements.map((measurement, index) => (index <= frame ? measurement[key] : null)),
  };
}

function updateSummary(contest, frame) {
  els.title.textContent = contest.label;
  els.type.textContent = contest.type === "walking" ? "步數排名" : "健康積分";
  els.description.textContent = contest.description;

  if (contest.type === "walking") {
    els.currentPeriod.textContent = `第 ${frame.periodId} 週`;
    els.currentRange.textContent = `${frame.date}｜本週第 ${frame.dayIndex} / ${frame.dayCount} 天`;
    return;
  }

  els.currentPeriod.textContent = `第 ${frame.measurementId} 次量測`;
  els.currentRange.textContent = frame.measurementDate;
}

function ensureSelectedParticipant(participants) {
  if (
    !state.selectedParticipantId ||
    !participants.some((item) => item.id === state.selectedParticipantId)
  ) {
    state.selectedParticipantId = participants[0]?.id || null;
  }
}

function renderParticipantButtons(participants, group) {
  return participants
    .map((participant) => {
      const active = participant.id === state.selectedParticipantId ? " active" : "";
      const missing = participant.hasAnyData ? "" : " no-data";
      return `<button class="participant-pill${active}${missing}" type="button" data-participant-id="${escapeAttribute(participant.id)}" data-group="${group}" style="--participant-color: ${participant.color}" title="${participant.hasAnyData ? "" : "尚無任何有效資料"}">${escapeHtml(participant.nickname)}</button>`;
    })
    .join("");
}

function bindParticipantButtons() {
  document.querySelectorAll("[data-participant-id]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedParticipantId = button.dataset.participantId;
      const data = getCachedActiveData();
      if (!data) return;
      if (data.type === "walking") renderWalking(data, state.currentFrame);
      if (data.type === "health") renderHealth(data, state.currentFrame);
    });
  });
}

function getCachedActiveData() {
  return state.dataCache.get(
    `${sourceSettings.source}:${sourceSettings.scenario}:${state.activeContest}`,
  );
}

function renderDetailHeading(participant, subtitle, status) {
  const missingClass = status === "有效資料" ? "" : " missing";
  return `
    <div class="detail-heading${missingClass}" style="--participant-color: ${participant.color}">
      <span></span>
      <div>
        <strong>${escapeHtml(participant.nickname)}</strong>
        <small>${escapeHtml(subtitle)}</small>
      </div>
    </div>
  `;
}

function renderMetric(label, value) {
  return `<div class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function showNotice(message) {
  if (!els.notice) return;
  els.notice.hidden = false;
  els.notice.textContent = message;
}

function getChart(key, element) {
  if (!state.charts[key] || state.charts[key].getDom() !== element) {
    state.charts[key]?.dispose();
    state.charts[key] = echarts.init(element);
  }
  return state.charts[key];
}

function replaceChartClick(chart, handler) {
  chart.off("click");
  chart.on("click", handler);
}

function hasAnyCsvValue(row) {
  return Object.values(row).some((value) => String(value || "").trim());
}

function readText(row, key) {
  return String(row?.[key] || "").trim();
}

function readFiniteNumber(row, key) {
  const raw = readText(row, key).replace(/,/g, "").replace(/%$/, "").trim();
  if (!raw || raw.startsWith("#")) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function formatNumber(value) {
  return Math.round(value || 0).toLocaleString("zh-Hant");
}

function formatDecimal(value) {
  return Number(value).toLocaleString("zh-Hant", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  });
}

function formatOptionalPercent(value) {
  return value === null ? "--" : `${formatDecimal(value)}%`;
}

function formatCompactNumber(value) {
  if (value >= 10000) return `${Math.round(value / 10000)}萬`;
  return formatNumber(value);
}

function showError(error) {
  stopAnimation();
  els.walkingPanel.hidden = true;
  els.healthPanel.hidden = true;
  if (els.notice) els.notice.hidden = true;
  els.error.hidden = false;
  els.error.innerHTML = `<h2>資料載入失敗</h2><p>${escapeHtml(error.message)}</p>`;
  console.error(error);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}
