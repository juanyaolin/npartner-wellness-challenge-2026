const STATUS_CONFIG = {
  contests: {
    walking: {
      label: "健走賽",
      type: "walking",
      csvUrl: "data/walking.csv",
      intervalMs: 200,
      description: "男女混合排名賽，依每兩週週期步數累計排名。未提供資料的週期會以 0 步計算。",
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
  ],
};

const app = document.querySelector("[data-status-app]");
const state = {
  activeContest: getInitialContest(),
  dataCache: new Map(),
  timer: null,
  selectedParticipantId: null,
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
  walkingBars: document.querySelector("[data-walking-bars]"),
  walkingFrame: document.querySelector("[data-walking-frame]"),
  walkingParticipants: document.querySelector("[data-walking-participants]"),
  walkingDetail: document.querySelector("[data-walking-detail]"),
  healthPanel: document.querySelector("[data-health-panel]"),
  healthBars: document.querySelector("[data-health-bars]"),
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
      const contest = tab.dataset.contestTab;
      setActiveContest(contest);
    });
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
  updateUrlContest(contestKey);
  updateTabState(contestKey);
  setLoading(contest);

  try {
    const data = await loadContestData(contestKey, contest);
    state.selectedParticipantId = data.participants[0]?.id || null;

    if (contest.type === "walking") {
      renderWalking(data, 0);
      startAnimation(contest.intervalMs, data.periods.length, (frame) =>
        renderWalking(data, frame),
      );
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
      complete: (results) => resolve(results.data),
      error: reject,
    });
  });
}

function normalizeWalking(rows) {
  const periods = collectPeriods(rows);
  const participantsMap = new Map();

  rows.forEach((row) => {
    const id = readText(row, "參賽者編號");
    if (!id) return;

    const periodId = readText(row, "週期編號");
    const participant = ensureParticipant(participantsMap, id, readText(row, "參賽者暱稱"));
    participant.periodInput.set(periodId, {
      periodId,
      startDate: readText(row, "週期開始日期"),
      endDate: readText(row, "週期結束日期"),
      steps: readNumber(row, "週期步數"),
    });
  });

  const participants = Array.from(participantsMap.values()).map((participant, index) => {
    let cumulativeSteps = 0;
    const periodRows = periods.map((period) => {
      const input = participant.periodInput.get(period.periodId);
      const steps = input?.steps || 0;
      cumulativeSteps += steps;
      return {
        ...period,
        steps,
        cumulativeSteps,
      };
    });

    return {
      id: participant.id,
      nickname: participant.nickname,
      color: STATUS_CONFIG.colors[index % STATUS_CONFIG.colors.length],
      periods: periodRows,
      totalSteps: cumulativeSteps,
    };
  });

  return {
    type: "walking",
    participants,
    periods,
  };
}

function normalizeHealth(rows) {
  const periods = collectPeriods(rows);
  const participantsMap = new Map();

  rows.forEach((row) => {
    const id = readText(row, "參賽者編號");
    if (!id) return;

    const periodId = readText(row, "週期編號");
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
            rankingPoints: item.hasData ? Math.max(participantCount - index, 1) : 0,
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
    const periodId = readText(row, "週期編號");
    if (!periodId || periodMap.has(periodId)) return;
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
  const period = data.periods[frame];
  const ranked = data.participants
    .map((participant) => ({
      ...participant,
      current: participant.periods[frame],
    }))
    .sort(
      (a, b) =>
        b.current.cumulativeSteps - a.current.cumulativeSteps ||
        a.nickname.localeCompare(b.nickname, "zh-Hant"),
    );

  if (
    !state.selectedParticipantId ||
    !data.participants.some((item) => item.id === state.selectedParticipantId)
  ) {
    state.selectedParticipantId = ranked[0]?.id || null;
  }

  updateSummary(contest, period, `${frame + 1} / ${data.periods.length}`);
  els.walkingPanel.hidden = false;
  els.healthPanel.hidden = true;
  els.walkingFrame.textContent = `週期 ${frame + 1} / ${data.periods.length}`;
  els.walkingBars.innerHTML = ranked
    .map((participant, index) =>
      renderWalkingBar(participant, index, ranked[0].current.cumulativeSteps),
    )
    .join("");
  els.walkingParticipants.innerHTML = renderParticipantButtons(data.participants, "walking");
  els.walkingDetail.innerHTML = renderWalkingDetail(data, ranked, frame);
  bindParticipantButtons();
}

function renderWalkingBar(participant, index, maxSteps) {
  const width = maxSteps ? Math.max((participant.current.cumulativeSteps / maxSteps) * 100, 2) : 2;
  return `
    <div class="race-row">
      <span class="race-rank">${index + 1}</span>
      <span class="race-name">${escapeHtml(participant.nickname)}</span>
      <div class="race-track">
        <div class="race-fill" style="width: ${width}%; background: ${participant.color}"></div>
      </div>
      <strong>${formatNumber(participant.current.cumulativeSteps)} 步</strong>
    </div>
  `;
}

function renderWalkingDetail(data, ranked, frame) {
  const participant =
    data.participants.find((item) => item.id === state.selectedParticipantId) || ranked[0];
  if (!participant) return "<p>尚無參賽者資料。</p>";

  const current = participant.periods[frame];
  const rank = ranked.findIndex((item) => item.id === participant.id) + 1;
  const previous = ranked[rank - 2];
  const next = ranked[rank];
  const average = Math.round(current.cumulativeSteps / (frame + 1));
  const bestPeriod = participant.periods
    .slice(0, frame + 1)
    .reduce((best, item) => (item.steps > best.steps ? item : best), participant.periods[0]);

  return `
    <div class="detail-heading" style="--participant-color: ${participant.color}">
      <span></span>
      <div><strong>${escapeHtml(participant.nickname)}</strong><small>目前第 ${rank} 名</small></div>
    </div>
    <div class="metric-grid">
      ${renderMetric("累計步數", `${formatNumber(current.cumulativeSteps)} 步`)}
      ${renderMetric("本週期步數", `${formatNumber(current.steps)} 步`)}
      ${renderMetric("平均每週期", `${formatNumber(average)} 步`)}
      ${renderMetric("最高單週期", `${formatNumber(bestPeriod.steps)} 步`)}
      ${renderMetric("與前一名差距", previous ? `${formatNumber(previous.current.cumulativeSteps - current.cumulativeSteps)} 步` : "--")}
      ${renderMetric("與下一名差距", next ? `${formatNumber(current.cumulativeSteps - next.current.cumulativeSteps)} 步` : "--")}
    </div>
    ${renderMiniBars(participant.periods.slice(0, frame + 1), "steps", participant.color, "步")}
  `;
}

function renderHealth(data, frame) {
  const contest = STATUS_CONFIG.contests[state.activeContest];
  const period = data.periods[frame];
  const ranked = data.participants
    .map((participant) => ({
      ...participant,
      current: participant.periods[frame],
    }))
    .sort(
      (a, b) =>
        b.current.totalPoints - a.current.totalPoints ||
        b.current.weightedPercent - a.current.weightedPercent,
    );

  if (
    !state.selectedParticipantId ||
    !data.participants.some((item) => item.id === state.selectedParticipantId)
  ) {
    state.selectedParticipantId = ranked[0]?.id || null;
  }

  updateSummary(contest, period, `${frame + 1} / ${data.periods.length}`);
  els.walkingPanel.hidden = true;
  els.healthPanel.hidden = false;
  els.healthFrame.textContent = `週期 ${frame + 1} / ${data.periods.length}`;
  els.healthBars.innerHTML = ranked
    .map((participant, index) => renderHealthBar(participant, index, ranked[0].current.totalPoints))
    .join("");
  els.healthWeightedChart.innerHTML = renderLineChart(
    data.participants,
    frame,
    "weightedPercent",
    "%",
  );
  els.healthParticipants.innerHTML = renderParticipantButtons(data.participants, "health");
  els.healthDetail.innerHTML = renderHealthDetail(data, ranked, frame);
  bindParticipantButtons();
}

function renderHealthBar(participant, index, maxPoints) {
  const rankingWidth = maxPoints ? (participant.current.rankingPointsTotal / maxPoints) * 100 : 0;
  const extraWidth = maxPoints ? (participant.current.extraPointsTotal / maxPoints) * 100 : 0;
  return `
    <div class="race-row score-row">
      <span class="race-rank">${index + 1}</span>
      <span class="race-name">${escapeHtml(participant.nickname)}</span>
      <div class="race-track stacked-track">
        <div class="race-fill" style="width: ${rankingWidth}%; background: ${participant.color}"></div>
        <div class="race-fill extra-fill" style="width: ${extraWidth}%; background-color: ${participant.color}"></div>
      </div>
      <strong>${formatNumber(participant.current.totalPoints)} 分</strong>
    </div>
  `;
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
    <h3 class="detail-subtitle">三項累計變化量</h3>
    ${renderParticipantDeltaChart(participant.periods.slice(0, frame + 1))}
  `;
}

function updateSummary(contest, period, frameLabel) {
  els.error.hidden = true;
  els.title.textContent = contest.label;
  els.type.textContent = contest.type === "walking" ? "步數排名" : "健康積分";
  els.description.textContent = contest.description;
  els.currentPeriod.textContent = period?.periodId || frameLabel;
  els.currentRange.textContent = period ? `${period.startDate} - ${period.endDate}` : "--";
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
      const currentFrameText = (els.currentPeriod.textContent || "").match(/\d+/)?.[0];
      const frameIndex = Math.max(Number(currentFrameText || 1) - 1, 0);
      const data = state.dataCache.get(state.activeContest);
      if (!data) return;
      if (data.type === "walking") renderWalking(data, frameIndex);
      if (data.type === "health") renderHealth(data, frameIndex);
    });
  });
}

function renderMetric(label, value) {
  return `<div class="metric"><span>${label}</span><strong>${value}</strong></div>`;
}

function renderMiniBars(periods, key, color, unit) {
  const max = Math.max(...periods.map((period) => period[key]), 1);
  return `
    <div class="mini-bars" aria-label="歷週期資料">
      ${periods
        .map((period) => {
          const height = Math.max((period[key] / max) * 100, 6);
          return `<div class="mini-bar"><span style="height: ${height}%; background: ${color}"></span><small>${period.periodId}</small><b>${formatNumber(period[key])}${unit}</b></div>`;
        })
        .join("")}
    </div>
  `;
}

function renderLineChart(participants, frame, key, unit) {
  const series = participants.map((participant) => ({
    label: participant.nickname,
    color: participant.color,
    values: participant.periods.slice(0, frame + 1).map((period) => ({
      label: period.periodId,
      value: period[key],
    })),
  }));

  return renderSvgLineChart(series, unit);
}

function renderParticipantDeltaChart(periods) {
  return renderSvgLineChart(
    [
      {
        label: "體重",
        color: "#168bd7",
        values: periods.map((period) => ({
          label: period.periodId,
          value: period.cumulativeWeightLossPercent,
        })),
      },
      {
        label: "體脂肪",
        color: "#86c440",
        values: periods.map((period) => ({
          label: period.periodId,
          value: period.cumulativeBodyFatLossPercent,
        })),
      },
      {
        label: "骨骼肌",
        color: "#e67b50",
        values: periods.map((period) => ({
          label: period.periodId,
          value: period.cumulativeSkeletalMuscleGainPercent,
        })),
      },
    ],
    "%",
  );
}

function renderSvgLineChart(series, unit) {
  const width = 760;
  const height = 280;
  const padding = 36;
  const values = series.flatMap((item) => item.values.map((point) => point.value));
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const range = max - min || 1;
  const pointCount = Math.max(...series.map((item) => item.values.length), 1);

  const lines = series
    .map((item) => {
      const points = item.values
        .map((point, index) => {
          const x = padding + (index / Math.max(pointCount - 1, 1)) * (width - padding * 2);
          const y = height - padding - ((point.value - min) / range) * (height - padding * 2);
          return `${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .join(" ");
      return `<polyline points="${points}" fill="none" stroke="${item.color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />`;
    })
    .join("");

  const legends = series
    .map(
      (item) => `<span><i style="background: ${item.color}"></i>${escapeHtml(item.label)}</span>`,
    )
    .join("");

  return `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="線圖">
      <line x1="${padding}" x2="${width - padding}" y1="${height - padding}" y2="${height - padding}" stroke="#d7e9ef" />
      <line x1="${padding}" x2="${padding}" y1="${padding}" y2="${height - padding}" stroke="#d7e9ef" />
      <text x="${padding}" y="24" fill="#5c7180" font-size="14">${formatDecimal(max)}${unit}</text>
      <text x="${padding}" y="${height - 8}" fill="#5c7180" font-size="14">${formatDecimal(min)}${unit}</text>
      ${lines}
    </svg>
    <div class="chart-legend">${legends}</div>
  `;
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
