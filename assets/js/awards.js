// 頒獎順序：調整物件的先後即可改順序。
// effects：揭曉姓名時的特效，可自由組合；不寫就是 ["鐘聲", "彩帶"]。
//   揭曉前（有任一項就先停 3 秒，期間不能前進）：聚光燈、倒數、鼓聲
//   揭曉時：鐘聲、彩帶、鈸聲、號角、煙火
// 名單取自賽況頁最後一期，見 docs/plans/2026-10-18-awards-ceremony.md。
const WALKING = { contest: "健走步數排名賽", group: "男女混合", unit: "步" };
const HEALTH_MEN = { contest: "健康管理積分賽", group: "男子組", unit: "分" };
const HEALTH_WOMEN = { contest: "健康管理積分賽", group: "女子組", unit: "分" };

const WINNERS = [
  { nickname: "我肚子餓了", awards: [{ ...HEALTH_WOMEN, rank: "季軍", score: 78, prize: 1000 }] },
  {
    nickname: "證券淨收付通知",
    awards: [{ ...HEALTH_WOMEN, rank: "亞軍", score: 84, prize: 3000 }],
  },
  {
    nickname: "321",
    awards: [{ ...HEALTH_WOMEN, rank: "冠軍", score: 90, prize: 5000 }],
    effects: ["聚光燈", "倒數", "鼓聲", "鐘聲", "彩帶"],
  },
  { nickname: "加減走", awards: [{ ...WALKING, rank: "第 6 名", score: 1529378, prize: 2000 }] },
  { nickname: "出門散步", awards: [{ ...WALKING, rank: "第 5 名", score: 1615779, prize: 2000 }] },
  {
    nickname: "妹寶",
    awards: [
      { ...WALKING, rank: "第 4 名", score: 2291796, prize: 2000 },
      { ...HEALTH_MEN, rank: "冠軍", score: 94, prize: 5000 },
    ],
  },
  {
    nickname: "瘋狂麥克",
    awards: [{ ...WALKING, rank: "第 3 名", score: 2346216, prize: 3000 }],
    effects: ["聚光燈", "倒數", "鼓聲", "鐘聲", "彩帶"],
  },
  {
    nickname: "強迫症患者",
    awards: [
      { ...WALKING, rank: "第 2 名", score: 2364876, prize: 5000 },
      { ...HEALTH_MEN, rank: "亞軍", score: 84, prize: 3000 },
    ],
    effects: ["聚光燈", "倒數", "鼓聲", "鐘聲", "彩帶"],
  },
  {
    nickname: "葡萄OvOb",
    awards: [
      { ...WALKING, rank: "第 1 名", score: 2840812, prize: 6000 },
      { ...HEALTH_MEN, rank: "季軍", score: 83, prize: 1000 },
    ],
    effects: ["聚光燈", "倒數", "鼓聲", "鈸聲", "號角", "煙火", "彩帶"],
  },
];

const NAMES = window.AWARD_NAMES || {};
const CONFETTI_COLORS = ["#f6c453", "#ffffff", "#168bd7", "#86c440", "#e67b50"];

const stage = document.querySelector("[data-stage]");
const countdownEl = document.querySelector("[data-countdown]");
const muteEl = document.querySelector("[data-mute]");

const slides = [
  { type: "cover" },
  { type: "notice" },
  ...WINNERS.flatMap((winner, index) => [
    { type: "winner", winner, index, revealed: false },
    { type: "winner", winner, index, revealed: true },
  ]),
  { type: "ending" },
];

let current = -1;
let locked = false;
let timers = [];

// ---------- 音效：Web Audio 即時合成，不需音效檔 ----------
const sound = (() => {
  let ctx = null;
  let master = null;
  let noise = null;
  let muted = false;

  function init() {
    if (ctx) {
      ctx.resume();
      return;
    }
    ctx = new window.AudioContext();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.8;
    master.connect(ctx.destination);
    noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  }

  function envelope(start, duration, volume) {
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(volume, start + (duration < 0.2 ? 0.002 : 0.015));
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    gain.connect(master);
    return gain;
  }

  function tone(freq, delay, duration, volume = 0.2, type = "triangle", endFreq = freq) {
    if (!ctx) return;
    const start = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    osc.frequency.exponentialRampToValueAtTime(endFreq, start + duration);
    osc.connect(envelope(start, duration, volume));
    osc.start(start);
    osc.stop(start + duration);
  }

  function hiss(delay, duration, volume, filterType, freq, endFreq = freq) {
    if (!ctx) return;
    const start = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(freq, start);
    filter.frequency.exponentialRampToValueAtTime(endFreq, start + duration);
    src.connect(filter);
    filter.connect(envelope(start, duration, volume));
    src.start(start, Math.random() * 1.5);
    src.stop(start + duration);
  }

  // 一擊小鼓：響弦的雜音加上鼓身的低音
  function snare(delay, volume) {
    hiss(delay, 0.14, volume * 0.7, "highpass", 1200);
    tone(230, delay, 0.09, volume * 0.6, "triangle", 150);
  }

  return {
    init,
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.8;
      return muted;
    },
    whoosh() {
      hiss(0, 0.7, 0.5, "bandpass", 250, 3500);
    },
    chime(level) {
      const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5, 1567.98];
      notes
        .slice(0, 3 + Math.round(level * 3))
        .forEach((freq, i) => tone(freq, i * 0.09, 1.6, 0.18));
    },
    // 滾奏由慢漸快（間隔 75ms → 35ms）、由弱漸強，最後重擊落在 seconds
    drumroll(seconds) {
      for (let t = 0, hit = 0; t < seconds - 0.05; hit += 1) {
        const progress = t / seconds;
        const accent = hit % 2 ? 0.8 : 1;
        snare(t, (0.1 + 0.5 * progress ** 1.5) * accent * (0.9 + Math.random() * 0.2));
        t += 0.075 - 0.04 * progress;
      }
      snare(seconds, 1);
      tone(110, seconds, 0.6, 0.6, "sine", 45);
    },
    cymbal() {
      hiss(0, 2.8, 0.45, "highpass", 6000, 4000);
    },
    fanfare() {
      [392, 523.25, 659.25].forEach((freq, i) => tone(freq, i * 0.14, 0.3, 0.12, "sawtooth"));
      [523.25, 659.25, 783.99, 1046.5].forEach((freq) => tone(freq, 0.45, 2.2, 0.08, "sawtooth"));
    },
  };
})();

// ---------- 畫面 ----------
function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

function formatNumber(value) {
  return value.toLocaleString("zh-TW");
}

function renderSlide(slide) {
  if (slide.type === "cover") {
    const letters = [..."頒獎典禮"]
      .map((char, i) => `<span style="animation-delay: ${0.5 + i * 0.18}s">${char}</span>`)
      .join("");
    return `
      <section class="slide slide-cover">
        <img class="cover-logo" src="images/logo.png" alt="N-Partner" />
        <p class="awards-eyebrow">N-Partner 三比八大賽 2026</p>
        <h1 class="cover-title">${letters}</h1>
        <p class="hint">按 → 或點擊畫面開始</p>
      </section>`;
  }

  if (slide.type === "notice") {
    return `
      <section class="slide slide-notice">
        <p class="awards-eyebrow">頒獎前說明</p>
        <h2>本次頒獎順序</h2>
        <p class="notice-line"><strong>不完全</strong>依照名次</p>
        <p class="notice-line">也<strong>不完全</strong>依照獎金高低</p>
        <p class="notice-tail">請大家拭目以待！</p>
      </section>`;
  }

  if (slide.type === "ending") {
    return `
      <section class="slide slide-ending">
        <img class="cover-logo" src="images/logo.png" alt="N-Partner" />
        <p class="awards-eyebrow">N-Partner 三比八大賽 2026</p>
        <h2>恭喜所有得獎者！</h2>
        <p class="notice-tail">感謝每一位夥伴這 18 週的努力</p>
      </section>`;
  }

  const { winner, index, revealed } = slide;
  const name = NAMES[winner.nickname];
  const awards = winner.awards
    .map(
      (award) => `
        <li class="award">
          <span class="award-contest">${award.contest}<small>${award.group}</small></span>
          <span class="award-result">
            <strong class="award-rank">${award.rank}</strong>
            <small class="award-score"><span data-count="${award.score}">${formatNumber(award.score)}</span> ${award.unit}</small>
          </span>
          <span class="award-prize">獎金 <b data-count="${award.prize}">${formatNumber(award.prize)}</b> 元</span>
        </li>`,
    )
    .join("");

  return `
    <section class="slide slide-winner">
      <p class="winner-order">得獎者 ${index + 1} / ${WINNERS.length}</p>
      <div class="card${revealed ? " is-flipped" : ""}" style="--level: ${getLevel(index)}">
        <div class="card-inner">
          <div class="card-face card-front">
            <p class="card-label">得獎者暱稱</p>
            <h2 class="card-nickname">${escapeHtml(winner.nickname)}</h2>
            <ul class="card-awards">${awards}</ul>
          </div>
          <div class="card-face card-back">
            <p class="card-label">恭喜</p>
            ${
              name
                ? `<h2 class="card-name">${escapeHtml(name)}</h2>`
                : `<h2 class="card-name is-missing">（尚未設定姓名）</h2>`
            }
            <p class="card-sub">暱稱「${escapeHtml(winner.nickname)}」</p>
          </div>
        </div>
      </div>
    </section>`;
}

// 0（第一位）到 1（最後一位）：越後面揭曉，效果越大
function getLevel(index) {
  return WINNERS.length > 1 ? index / (WINNERS.length - 1) : 1;
}

function countUp(delayMs) {
  stage.querySelectorAll("[data-count]").forEach((el) => {
    const target = Number(el.dataset.count);
    el.textContent = "0";
    let startTime = null;
    const step = (now) => {
      startTime ??= now + delayMs;
      const progress = Math.min(Math.max((now - startTime) / 1500, 0), 1);
      el.textContent = formatNumber(Math.round(target * (1 - (1 - progress) ** 3)));
      if (progress < 1 && el.isConnected) window.requestAnimationFrame(step);
    };
    window.requestAnimationFrame(step);
  });
}

function burst(level) {
  if (typeof window.confetti !== "function") return;
  window.confetti({
    particleCount: Math.round(80 + level * 320),
    spread: 70 + level * 60,
    startVelocity: 40 + level * 25,
    origin: { y: 0.65 },
    colors: CONFETTI_COLORS,
  });
  if (level < 0.5) return;
  [0, 1].forEach((x) =>
    window.confetti({
      particleCount: Math.round(level * 120),
      angle: x ? 120 : 60,
      spread: 60,
      origin: { x, y: 0.8 },
      colors: CONFETTI_COLORS,
    }),
  );
}

function fireworks(durationMs) {
  if (typeof window.confetti !== "function") return;
  const end = Date.now() + durationMs;
  const id = window.setInterval(() => {
    if (Date.now() > end) {
      window.clearInterval(id);
      return;
    }
    window.confetti({
      particleCount: 60,
      startVelocity: 35,
      spread: 360,
      ticks: 90,
      origin: { x: 0.1 + Math.random() * 0.8, y: Math.random() * 0.5 },
      colors: CONFETTI_COLORS,
    });
  }, 280);
  timers.push(() => window.clearInterval(id));
}

function later(ms, fn) {
  const id = window.setTimeout(fn, ms);
  timers.push(() => window.clearTimeout(id));
}

function clearEffects() {
  timers.forEach((cancel) => cancel());
  timers = [];
  locked = false;
  document.body.classList.remove("is-suspense");
  countdownEl.innerHTML = "";
  window.confetti?.reset?.();
}

function flip(effects, level) {
  stage.querySelector(".card")?.classList.add("is-flipped");
  // 翻轉到一半時背面才看得到，揭曉特效跟著背面出現
  later(REVEAL_DELAY_MS, () => effects.forEach((name) => REVEAL_EFFECTS[name]?.(level)));
}

function reveal(slide) {
  const effects = slide.winner.effects ?? DEFAULT_EFFECTS;
  const level = getLevel(slide.index);
  if (!effects.some((name) => SUSPENSE_EFFECTS.includes(name))) {
    flip(effects, level);
    return;
  }

  locked = true;
  if (effects.includes("聚光燈")) document.body.classList.add("is-suspense");
  if (effects.includes("鼓聲")) sound.drumroll((SUSPENSE_MS + REVEAL_DELAY_MS) / 1000);
  if (effects.includes("倒數")) {
    [3, 2, 1].forEach((n, i) =>
      later(i * 1000, () => (countdownEl.innerHTML = `<span>${n}</span>`)),
    );
  }
  later(SUSPENSE_MS, () => {
    locked = false;
    countdownEl.innerHTML = "";
    document.body.classList.remove("is-suspense");
    flip(effects, level);
  });
}

const SUSPENSE_MS = 3000;
const REVEAL_DELAY_MS = 650;
const DEFAULT_EFFECTS = ["鐘聲", "彩帶"];
const SUSPENSE_EFFECTS = ["聚光燈", "倒數", "鼓聲"];
const REVEAL_EFFECTS = {
  鐘聲: (level) => sound.chime(level),
  彩帶: (level) => burst(level),
  鈸聲: () => sound.cymbal(),
  號角: () => sound.fanfare(),
  煙火: () => fireworks(6000),
};

// 特效名稱打錯時，開頁就提示，彩排時才看得到
const unknownEffects = WINNERS.flatMap((winner) =>
  (winner.effects ?? [])
    .filter((name) => !SUSPENSE_EFFECTS.includes(name) && !(name in REVEAL_EFFECTS))
    .map((name) => `${winner.nickname}：${name}`),
);
if (unknownEffects.length) window.alert(`找不到這些特效名稱：\n${unknownEffects.join("\n")}`);

function go(index, animate) {
  if (index < 0 || index >= slides.length || index === current) return;
  const prevSlide = slides[current];
  const slide = slides[index];
  clearEffects();
  current = index;
  window.history.replaceState(null, "", `#${index}`);

  // 同一張卡片從第一頁到第二頁：保留畫面直接翻面
  if (animate && slide.revealed && prevSlide?.winner === slide.winner) {
    stage.classList.remove("no-anim");
    reveal(slide);
    return;
  }

  stage.classList.toggle("no-anim", !animate);
  stage.innerHTML = renderSlide(slide);
  if (!animate) return;

  if (slide.type === "winner") {
    sound.whoosh();
    countUp(500);
  } else if (slide.type === "notice") {
    sound.chime(0);
  } else if (slide.type === "ending") {
    sound.fanfare();
    burst(1);
  }
}

function next() {
  if (locked) return;
  sound.init();
  go(current + 1, true);
}

function previous() {
  go(current - 1, false);
}

document.addEventListener("keydown", (event) => {
  if (["ArrowRight", "PageDown", " ", "Enter"].includes(event.key)) {
    event.preventDefault();
    next();
  } else if (["ArrowLeft", "PageUp", "Backspace"].includes(event.key)) {
    event.preventDefault();
    previous();
  } else if (event.key.toLowerCase() === "m") {
    muteEl.hidden = !sound.toggleMute();
  }
});

document.addEventListener("click", next);

// 重新整理時停在原本那一頁（網址 #頁碼）
const startIndex = Math.min(Number(window.location.hash.slice(1)) || 0, slides.length - 1);
go(startIndex, startIndex === 0);
