const STATUS_CONFIG = {
  contests: {
    walking: {
      label: "健走賽",
      type: "walking",
      csvUrl: "data/walking.csv",
      intervalMs: 200,
      description: "男女混合排名賽，依每周累計步數排序。",
    },
    "health-men": {
      label: "男子健康賽",
      type: "health",
      csvUrl: "data/health-men.csv",
      intervalMs: 1000,
      description: "男子組獨立排名，依體重、體脂肪、骨骼肌加權結果計算排名積分並加總額外積分。",
    },
    "health-women": {
      label: "女子健康賽",
      type: "health",
      csvUrl: "data/health-women.csv",
      intervalMs: 1000,
      description: "女子組獨立排名，依體重、體脂肪、骨骼肌加權結果計算排名積分並加總額外積分。",
    },
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
const state = {
  activeContest: getInitialContest(),
  dataCache: new Map(),
  timer: null,
  selectedParticipantId: null,
  currentFrame: 0,
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
  currentPeriod: document.querySelector("[data-current-period]"),
  currentRange: document.querySelector("[data-current-range]"),
  error: document.querySelector("[data-status-error]"),
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
    tab.addEventListener("click", () => {
      setActiveContest(tab.dataset.contestTab);
    });
  });

  window.addEventListener("resize", () => {
    Object.values(state.charts).forEach((chart) => chart?.resize());
    rerenderActiveContest();
  });

  setActiveContest(state.activeContest);
}

function getInitialContest() {
  const params = new URLSearchParams(window.location.search);
  const contest = params.get("contest") || "walking";
  return STATUS_CONFIG.contests[contest] ? contest : "walking";
}

async function setActiveContest(contestKey) {
  const contest = STATUS_CONFIG.contests[contestKey];
  if (!contest) return;

  window.clearInterval(state.timer);
  state.timer = null;
  state.activeContest = contestKey;
  state.selectedParticipantId = null;
  state.currentFrame = 0;
  updateUrlContest(contestKey);
  updateTabState(contestKey);
  setLoading(contest);

  try {
    const data = await loadContestData(contestKey, contest);
    state.selectedParticipantId = data.participants[0]?.id || null;

    if (contest.type === "walking") {
      renderWalking(data, 0);
      startAnimation(contest.intervalMs, data.days.length, (frame) => renderWalking(data, frame));
    } else {
      renderHealth(data, 0);
      startAnimation(contest.intervalMs, data.periods.length, (frame) => renderHealth(data, frame));
    }
  } catch (error) {
    showError(error);
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
  els.error.hidden = true;
  els.walkingPanel.hidden = true;
  els.healthPanel.hidden = true;
  els.title.textContent = `${contest.label}載入中...`;
  els.type.textContent = contest.type === "walking" ? "健走資料" : "健康資料";
  els.description.textContent = contest.description;
  els.currentPeriod.textContent = "--";
  els.currentRange.textContent = "CSV 載入中";
}

async function loadContestData(contestKey, contest) {
  if (state.dataCache.has(contestKey)) {
    return state.dataCache.get(contestKey);
  }

  const response = await fetch(contest.csvUrl);
  if (!response.ok) {
    throw new Error(`無法讀取 ${contest.csvUrl}（HTTP ${response.status}）`);
  }

  const csvText = await response.text();
  const rows = await parseCsv(csvText);
  const data = contest.type === "walking" ? normalizeWalking(rows) : normalizeHealth(rows);
  state.dataCache.set(contestKey, data);
  return data;
}

function parseCsv(csvText) {
  return new Promise((resolve, reject) => {
    Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim(),
      complete: (results) => resolve(results.data.filter(hasAnyCsvValue)),
      error: reject,
    });
  });
}

function normalizeWalking(rows) {
  const periods = collectPeriods(rows);
  const days = periods.flatMap((period) => expandPeriodDays(period));
  const participantsMap = new Map();

  rows.forEach((row) => {
    const id = readText(row, "參賽者編號");
    const periodId = readText(row, "週期編號");
    if (!id || !periodId) return;

    const participant = ensureParticipant(participantsMap, id, readText(row, "參賽者暱稱"));
    participant.periodInput.set(periodId, {
      periodId,
      steps: readNumber(row, "週期步數"),
    });
  });

  const participants = Array.from(participantsMap.values()).map((participant, index) => {
    let cumulativeSteps = 0;
    const dailyFrames = [];
    const periodFrames = [];

    periods.forEach((period) => {
      const input = participant.periodInput.get(period.periodId);
      const periodSteps = input?.steps || 0;
      const periodDays = expandPeriodDays(period);
      const dailySteps = distributeSteps(periodSteps, periodDays.length);
      const periodStartCumulative = cumulativeSteps;

      periodDays.forEach((day, dayIndex) => {
        cumulativeSteps += dailySteps[dayIndex];
        dailyFrames.push({
          ...day,
          steps: dailySteps[dayIndex],
          periodSteps,
          cumulativeSteps,
        });
      });

      periodFrames.push({
        ...period,
        steps: periodSteps,
        cumulativeSteps,
        periodStartCumulative,
      });
    });

    return {
      id: participant.id,
      nickname: participant.nickname,
      color: STATUS_CONFIG.colors[index % STATUS_CONFIG.colors.length],
      dailyFrames,
      periods: periodFrames,
      totalSteps: cumulativeSteps,
    };
  });

  return {
    type: "walking",
    participants,
    periods,
    days,
  };
}

function normalizeHealth(rows) {
  const periods = collectPeriods(rows);
  const participantsMap = new Map();

  rows.forEach((row) => {
    const id = readText(row, "參賽者編號");
    const periodId = readText(row, "週期編號");
    if (!id || !periodId) return;

    const weightLossPercent = readNumber(row, "體重減少率");
    const bodyFatLossPercent = readNumber(row, "體脂肪減少率");
    const skeletalMuscleGainPercent = readNumber(row, "骨骼肌增加率");
    const weightedPercent = calculateWeightedPercent({
      weightLossPercent,
      bodyFatLossPercent,
      skeletalMuscleGainPercent,
    });
    const participant = ensureParticipant(participantsMap, id, readText(row, "參賽者暱稱"));

    participant.periodInput.set(periodId, {
      periodId,
      startDate: readText(row, "週期開始日期"),
      endDate: readText(row, "週期結束日期"),
      weightLossPercent,
      bodyFatLossPercent,
      skeletalMuscleGainPercent,
      cumulativeWeightLossPercent: readNumber(row, "累計體重減少率"),
      cumulativeBodyFatLossPercent: readNumber(row, "累計體脂肪減少率"),
      cumulativeSkeletalMuscleGainPercent: readNumber(row, "累計骨骼肌增加率"),
      extraPoints: readNumber(row, "額外積分"),
      weightedPercent,
    });
  });

  const participantCount = participantsMap.size;
  const rankingByPeriod = new Map();

  periods.forEach((period) => {
    const ranked = Array.from(participantsMap.values())
      .map((participant) => {
        const input = participant.periodInput.get(period.periodId);
        return {
          id: participant.id,
          nickname: participant.nickname,
          weightedPercent: input?.weightedPercent ?? Number.NEGATIVE_INFINITY,
          hasData: Boolean(input),
        };
      })
      .sort((a, b) => {
        if (a.hasData !== b.hasData) return a.hasData ? -1 : 1;
        if (b.weightedPercent !== a.weightedPercent) return b.weightedPercent - a.weightedPercent;
        return a.nickname.localeCompare(b.nickname, "zh-Hant");
      });

    rankingByPeriod.set(
      period.periodId,
      new Map(
        ranked.map((item, index) => [
          item.id,
          {
            rank: index + 1,
            rankingPoints: item.hasData ? Math.max(participantCount - index + 1, 1) : 0,
          },
        ]),
      ),
    );
  });

  const participants = Array.from(participantsMap.values()).map((participant, index) => {
    let rankingPointsTotal = 0;
    let extraPointsTotal = 0;
    const periodRows = periods.map((period) => {
      const input = participant.periodInput.get(period.periodId);
      const ranking = rankingByPeriod.get(period.periodId).get(participant.id);
      const rankingPoints = input ? ranking.rankingPoints : 0;
      const extraPoints = input?.extraPoints || 0;
      rankingPointsTotal += rankingPoints;
      extraPointsTotal += extraPoints;

      return {
        ...period,
        weightLossPercent: input?.weightLossPercent || 0,
        bodyFatLossPercent: input?.bodyFatLossPercent || 0,
        skeletalMuscleGainPercent: input?.skeletalMuscleGainPercent || 0,
        cumulativeWeightLossPercent: input?.cumulativeWeightLossPercent || 0,
        cumulativeBodyFatLossPercent: input?.cumulativeBodyFatLossPercent || 0,
        cumulativeSkeletalMuscleGainPercent: input?.cumulativeSkeletalMuscleGainPercent || 0,
        weightedPercent: input?.weightedPercent || 0,
        rankingPoints,
        extraPoints,
        rankingPointsTotal,
        extraPointsTotal,
        totalPoints: rankingPointsTotal + extraPointsTotal,
        rank: input ? ranking.rank : null,
      };
    });

    return {
      id: participant.id,
      nickname: participant.nickname,
      color: STATUS_CONFIG.colors[index % STATUS_CONFIG.colors.length],
      periods: periodRows,
      rankingPointsTotal,
      extraPointsTotal,
      totalPoints: rankingPointsTotal + extraPointsTotal,
    };
  });

  return {
    type: "health",
    participants,
    periods,
  };
}

function collectPeriods(rows) {
  const periodMap = new Map();

  rows.forEach((row) => {
    const id = readText(row, "參賽者編號");
    const periodId = readText(row, "週期編號");
    if (!id || !periodId || periodMap.has(periodId)) return;
    periodMap.set(periodId, {
      periodId,
      startDate: readText(row, "週期開始日期"),
      endDate: readText(row, "週期結束日期"),
    });
  });

  return Array.from(periodMap.values()).sort((a, b) => naturalPeriodOrder(a.periodId, b.periodId));
}

function ensureParticipant(map, id, nickname) {
  if (!map.has(id)) {
    map.set(id, {
      id,
      nickname: nickname || id,
      periodInput: new Map(),
    });
  }

  return map.get(id);
}

function naturalPeriodOrder(a, b) {
  const aNumber = Number(String(a).match(/\d+/)?.[0] || 0);
  const bNumber = Number(String(b).match(/\d+/)?.[0] || 0);
  return aNumber - bNumber || String(a).localeCompare(String(b), "zh-Hant");
}

function calculateWeightedPercent(period) {
  const weights = STATUS_CONFIG.healthScore;
  return (
    period.weightLossPercent * weights.weightLossWeight +
    period.bodyFatLossPercent * weights.bodyFatLossWeight +
    period.skeletalMuscleGainPercent * weights.skeletalMuscleGainWeight
  );
}

function expandPeriodDays(period) {
  const startDate = parseDate(period.startDate);
  const endDate = parseDate(period.endDate);
  const dayCount = Math.max(Math.round((endDate - startDate) / 86400000) + 1, 1);

  return Array.from({ length: dayCount }, (_, index) => {
    const current = new Date(startDate);
    current.setDate(startDate.getDate() + index);
    return {
      periodId: period.periodId,
      startDate: period.startDate,
      endDate: period.endDate,
      date: formatDate(current),
      dayIndex: index + 1,
      dayCount,
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

function parseDate(value) {
  const [year, month, day] = value.split(/[/-]/).map((part) => Number(part));
  return new Date(year, month - 1, day);
}

function formatDate(value) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}/${month}/${day}`;
}

function startAnimation(intervalMs, frameCount, render) {
  let frame = 0;

  window.clearInterval(state.timer);
  state.timer = window.setInterval(() => {
    frame += 1;
    if (frame >= frameCount) {
      window.clearInterval(state.timer);
      state.timer = null;
      return;
    }

    render(frame);
  }, intervalMs);
}

function renderWalking(data, frame) {
  const contest = STATUS_CONFIG.contests[state.activeContest];
  const day = data.days[frame];
  const ranked = getWalkingRanked(data, frame);

  state.currentFrame = frame;
  ensureSelectedParticipant(data.participants, ranked);
  updateSummary(contest, day, `${frame + 1} / ${data.days.length}`);
  els.walkingPanel.hidden = false;
  els.healthPanel.hidden = true;
  els.walkingFrame.textContent = `第 ${frame + 1} 天 / ${data.days.length} 天`;
  els.walkingParticipants.innerHTML = renderParticipantButtons(data.participants, "walking");
  els.walkingDetail.innerHTML = renderWalkingDetail(data, ranked, frame);
  renderWalkingChart(ranked, frame);
  bindParticipantButtons();
}

function getWalkingRanked(data, frame) {
  return data.participants
    .map((participant) => ({
      ...participant,
      current: participant.dailyFrames[frame],
    }))
    .sort(
      (a, b) =>
        b.current.cumulativeSteps - a.current.cumulativeSteps ||
        a.nickname.localeCompare(b.nickname, "zh-Hant"),
    );
}

function renderWalkingChart(ranked, frame) {
  const chart = getChart("walking", els.walkingChart);
  const labels = ranked.map((participant) => participant.nickname);
  const values = ranked.map((participant) => ({
    value: participant.current.cumulativeSteps,
    id: participant.id,
    itemStyle: { color: participant.color },
  }));

  chart.setOption({
    animationDuration: 250,
    animationDurationUpdate: 450,
    animationEasing: "cubicOut",
    animationEasingUpdate: "cubicInOut",
    grid: { top: 12, right: 12, bottom: 18, left: 12, containLabel: false },
    tooltip: {
      trigger: "item",
      formatter: (params) =>
        `${escapeHtml(params.name)}<br/>累計：${formatNumber(params.value)} 步`,
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
          formatter: (params) => `${params.name}｜${formatCompactNumber(params.value)} 步`,
          color: "white",
          fontWeight: 900,
          padding: [0, 0, 0, 8],
          textShadowBlur: 4,
          textShadowColor: "rgba(0,0,0,0.35)",
        },
        universalTransition: true,
      },
    ],
  });

  replaceChartClick(chart, (params) => {
    state.selectedParticipantId = params.data.id;
    renderWalking(state.dataCache.get(state.activeContest), frame);
  });
}

function renderWalkingDetail(data, ranked, frame) {
  const participant =
    data.participants.find((item) => item.id === state.selectedParticipantId) || ranked[0];
  if (!participant) return "<p>尚無參賽者資料。</p>";

  const current = participant.dailyFrames[frame];
  const rank = ranked.findIndex((item) => item.id === participant.id) + 1;
  const previous = ranked[rank - 2];
  const next = ranked[rank];
  const periodFrame = participant.periods.find((period) => period.periodId === current.periodId);
  const bestDay = participant.dailyFrames
    .slice(0, frame + 1)
    .reduce((best, item) => (item.steps > best.steps ? item : best), participant.dailyFrames[0]);

  return `
    <div class="detail-heading" style="--participant-color: ${participant.color}">
      <span></span>
      <div><strong>${escapeHtml(participant.nickname)}</strong><small>目前第 ${rank} 名｜${current.date}</small></div>
    </div>
    <div class="metric-grid">
      ${renderMetric("累計步數", `${formatNumber(current.cumulativeSteps)} 步`)}
      ${renderMetric("今日步數", `${formatNumber(current.steps)} 步`)}
      ${renderMetric("本週期累計", `${formatNumber(current.cumulativeSteps - periodFrame.periodStartCumulative)} 步`)}
      ${renderMetric("本週期總步數", `${formatNumber(periodFrame.steps)} 步`)}
      ${renderMetric("最高單日", `${formatNumber(bestDay.steps)} 步`)}
      ${renderMetric("與前一名差距", previous ? `${formatNumber(previous.current.cumulativeSteps - current.cumulativeSteps)} 步` : "--")}
      ${renderMetric("與下一名差距", next ? `${formatNumber(current.cumulativeSteps - next.current.cumulativeSteps)} 步` : "--")}
    </div>
  `;
}

function renderHealth(data, frame) {
  const contest = STATUS_CONFIG.contests[state.activeContest];
  const period = data.periods[frame];
  const ranked = getHealthRanked(data, frame);

  state.currentFrame = frame;
  ensureSelectedParticipant(data.participants, ranked);
  updateSummary(contest, period, `${frame + 1} / ${data.periods.length}`);
  els.walkingPanel.hidden = true;
  els.healthPanel.hidden = false;
  els.healthFrame.textContent = `週期 ${frame + 1} / ${data.periods.length}`;
  els.healthParticipants.innerHTML = renderParticipantButtons(data.participants, "health");
  els.healthDetail.innerHTML = renderHealthDetail(data, ranked, frame);
  renderHealthScoreChart(ranked, frame);
  renderHealthWeightedChart(data, frame);
  renderDetailDeltaChart(data, frame);
  bindParticipantButtons();
}

function getHealthRanked(data, frame) {
  return data.participants
    .map((participant) => ({
      ...participant,
      current: participant.periods[frame],
    }))
    .sort(
      (a, b) =>
        b.current.totalPoints - a.current.totalPoints ||
        b.current.weightedPercent - a.current.weightedPercent,
    );
}

function renderHealthScoreChart(ranked, frame) {
  const chart = getChart("healthScore", els.healthScoreChart);
  const labels = ranked.map((participant) => participant.nickname);

  chart.setOption({
    animationDuration: 350,
    animationDurationUpdate: 650,
    animationEasingUpdate: "cubicInOut",
    color: STATUS_CONFIG.colors,
    grid: { top: 12, right: 12, bottom: 42, left: 12, containLabel: false },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
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
          itemStyle: { color: participant.color },
        })),
        barMaxWidth: 30,
        label: {
          show: true,
          position: "insideLeft",
          formatter: (params) => {
            const participant = ranked[params.dataIndex];
            return `${participant.nickname}｜${formatNumber(participant.current.totalPoints)} 分`;
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
            color: participant.color,
            decal: {
              symbol: "rect",
              dashArrayX: [2, 2],
              dashArrayY: [6, 4],
              rotation: Math.PI / 4,
              color: "rgba(255,255,255,0.55)",
            },
          },
        })),
        universalTransition: true,
      },
    ],
  });

  replaceChartClick(chart, (params) => {
    state.selectedParticipantId = params.data.id;
    renderHealth(state.dataCache.get(state.activeContest), frame);
  });
}

function renderHealthWeightedChart(data, frame) {
  const chart = getChart("healthWeighted", els.healthWeightedChart);
  const periods = data.periods.slice(0, frame + 1).map((period) => period.periodId);

  chart.setOption({
    animationDurationUpdate: 450,
    grid: { top: 24, right: 26, bottom: 64, left: 48 },
    tooltip: {
      trigger: "axis",
      valueFormatter: (value) => `${formatDecimal(value)}%`,
    },
    legend: {
      type: "scroll",
      bottom: 0,
      data: data.participants.map((participant) => participant.nickname),
    },
    xAxis: { type: "category", data: periods, boundaryGap: false },
    yAxis: {
      type: "value",
      axisLabel: { formatter: "{value}%" },
      splitLine: { lineStyle: { color: "#e6f0f4" } },
    },
    series: data.participants.map((participant) => ({
      id: participant.id,
      name: participant.nickname,
      type: "line",
      showSymbol: true,
      symbol: "circle",
      symbolSize: 8,
      emphasis: { focus: "series" },
      itemStyle: { color: participant.color },
      lineStyle: { color: participant.color, width: 2 },
      data: participant.periods.slice(0, frame + 1).map((period) => period.weightedPercent),
    })),
  });

  replaceChartClick(chart, (params) => {
    const participant = data.participants.find((item) => item.nickname === params.seriesName);
    if (!participant) return;
    state.selectedParticipantId = participant.id;
    renderHealth(data, frame);
  });
}

function renderHealthDetail(data, ranked, frame) {
  const participant =
    data.participants.find((item) => item.id === state.selectedParticipantId) || ranked[0];
  if (!participant) return "<p>尚無參賽者資料。</p>";

  const current = participant.periods[frame];
  const rank = ranked.findIndex((item) => item.id === participant.id) + 1;

  return `
    <div class="detail-heading" style="--participant-color: ${participant.color}">
      <span></span>
      <div><strong>${escapeHtml(participant.nickname)}</strong><small>目前第 ${rank} 名</small></div>
    </div>
    <div class="metric-grid">
      ${renderMetric("總積分", `${formatNumber(current.totalPoints)} 分`)}
      ${renderMetric("排名積分", `${formatNumber(current.rankingPointsTotal)} 分`)}
      ${renderMetric("額外積分", `${formatNumber(current.extraPointsTotal)} 分`)}
      ${renderMetric("本期加權", `${formatDecimal(current.weightedPercent)}%`)}
      ${renderMetric("累計體重減少", `${formatDecimal(current.cumulativeWeightLossPercent)}%`)}
      ${renderMetric("累計體脂減少", `${formatDecimal(current.cumulativeBodyFatLossPercent)}%`)}
      ${renderMetric("累計骨骼肌增加", `${formatDecimal(current.cumulativeSkeletalMuscleGainPercent)}%`)}
    </div>
  `;
}

function renderDetailDeltaChart(data, frame) {
  const container = document.querySelector("[data-detail-delta-chart]");
  if (!container) return;

  const participant = data.participants.find((item) => item.id === state.selectedParticipantId);
  if (!participant) return;

  const periodLabels = data.periods.map((period) => period.periodId);
  const visiblePeriods = participant.periods.map((period, index) =>
    index <= frame ? period : null,
  );
  const chart = getChart("detailDelta", container);
  chart.setOption({
    animationDurationUpdate: 450,
    grid: { top: 24, right: 22, bottom: 30, left: 42 },
    tooltip: {
      trigger: "axis",
      valueFormatter: (value) => `${formatDecimal(value)}%`,
    },
    legend: { top: 0, data: ["體重", "體脂肪", "骨骼肌"] },
    xAxis: { type: "category", data: periodLabels, boundaryGap: false },
    yAxis: {
      type: "value",
      axisLabel: { formatter: "{value}%" },
      splitLine: { lineStyle: { color: "#e6f0f4" } },
    },
    series: [
      {
        name: "體重",
        type: "line",
        showSymbol: true,
        symbolSize: 9,
        itemStyle: { color: "#168bd7" },
        data: visiblePeriods.map((period) => period?.cumulativeWeightLossPercent ?? null),
      },
      {
        name: "體脂肪",
        type: "line",
        showSymbol: true,
        symbolSize: 9,
        itemStyle: { color: "#86c440" },
        data: visiblePeriods.map((period) => period?.cumulativeBodyFatLossPercent ?? null),
      },
      {
        name: "骨骼肌",
        type: "line",
        showSymbol: true,
        symbolSize: 9,
        itemStyle: { color: "#e67b50" },
        data: visiblePeriods.map((period) => period?.cumulativeSkeletalMuscleGainPercent ?? null),
      },
    ],
  });
}

function updateSummary(contest, frame, frameLabel) {
  els.error.hidden = true;
  els.title.textContent = contest.label;
  els.type.textContent = contest.type === "walking" ? "步數排名" : "健康積分";
  els.description.textContent = contest.description;
  els.currentPeriod.textContent = frame?.periodId || frameLabel;

  if (contest.type === "walking" && frame?.date) {
    els.currentRange.textContent = `${frame.date}｜${frame.periodId} 第 ${frame.dayIndex} / ${frame.dayCount} 天`;
    return;
  }

  els.currentRange.textContent = frame ? `${frame.startDate} - ${frame.endDate}` : "--";
}

function ensureSelectedParticipant(participants, ranked) {
  if (
    !state.selectedParticipantId ||
    !participants.some((item) => item.id === state.selectedParticipantId)
  ) {
    state.selectedParticipantId = ranked[0]?.id || null;
  }
}

function renderParticipantButtons(participants, group) {
  return participants
    .map((participant) => {
      const active = participant.id === state.selectedParticipantId ? " active" : "";
      return `<button class="participant-pill${active}" type="button" data-participant-id="${escapeAttribute(participant.id)}" data-group="${group}" style="--participant-color: ${participant.color}">${escapeHtml(participant.nickname)}</button>`;
    })
    .join("");
}

function bindParticipantButtons() {
  document.querySelectorAll("[data-participant-id]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedParticipantId = button.dataset.participantId;
      const data = state.dataCache.get(state.activeContest);
      if (!data) return;
      if (data.type === "walking") renderWalking(data, state.currentFrame);
      if (data.type === "health") renderHealth(data, state.currentFrame);
    });
  });
}

function renderMetric(label, value) {
  return `<div class="metric"><span>${label}</span><strong>${value}</strong></div>`;
}

function rerenderActiveContest() {
  const data = state.dataCache.get(state.activeContest);
  if (!data) return;
  if (data.type === "walking") renderWalking(data, state.currentFrame);
  if (data.type === "health") renderHealth(data, state.currentFrame);
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
  return String(row[key] || "").trim();
}

function readNumber(row, key) {
  const raw = String(row[key] || "0")
    .replace(/,/g, "")
    .replace("%", "")
    .trim();
  const value = Number(raw);
  return Number.isFinite(value) ? value : 0;
}

function formatNumber(value) {
  return Math.round(value).toLocaleString("zh-Hant");
}

function formatDecimal(value) {
  return Number(value).toLocaleString("zh-Hant", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  });
}

function formatCompactNumber(value) {
  if (value >= 10000) return `${Math.round(value / 10000)}萬`;
  return formatNumber(value);
}

function showError(error) {
  els.walkingPanel.hidden = true;
  els.healthPanel.hidden = true;
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
