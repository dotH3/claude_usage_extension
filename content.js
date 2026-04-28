/**
 * content.js — injected into claude.ai pages
 *
 * Renders a floating usage badge in the bottom-right corner.
 * Shows on hover: full breakdown tooltip.
 *
 * Does NOT intercept fetch — relies on background.js polling the API.
 * Listens for chrome.runtime messages to update in real-time.
 */

const WIDGET_ID = "claude-usage-ext-widget";
const TOOLTIP_ID = "claude-usage-ext-tooltip";

// ─── Utilities ───────────────────────────────────────────────────────────────

function pct(n) {
  if (n == null) return "?";
  return `${Math.round(n)}%`;
}

function timeUntil(isoString) {
  if (!isoString) return null;
  const ms = new Date(isoString).getTime() - Date.now();
  if (ms <= 0) return "resetting soon";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

const COLORS = {
  critical: "#c0392b",
  warn:     "#b45309",
  ok:       "#2d6a4f",
  muted:    "#7a7068",
  accent:   "#c96442",
};

function severityOf(u) {
  if (u == null) return "muted";
  if (u >= 90) return "critical";
  if (u >= 70) return "warn";
  return "ok";
}

function colorForUtilization(u) {
  return COLORS[severityOf(u)];
}

const BAR_W = 16;
function asciiBar(util) {
  const filled = Math.round(Math.min(Math.max(util ?? 0, 0), 100) / 100 * BAR_W);
  return "[" + "█".repeat(filled) + "░".repeat(BAR_W - filled) + "]";
}

// ─── Render ──────────────────────────────────────────────────────────────────

function buildTooltipHTML(data) {
  if (!data) return "<em>no data</em>";

  const rows = data.windows.map((w) => {
    const color = colorForUtilization(w.utilization);
    const reset = timeUntil(w.resetsAt);
    const bar = asciiBar(w.utilization);
    return `
      <div class="cue-row">
        <span class="cue-label">${w.label.toLowerCase().replace(" ", "_")}</span>
        <span class="cue-bar" style="color:${color}">${bar}</span>
        <span class="cue-pct" style="color:${color}">${pct(w.utilization)}</span>
        ${reset ? `<span class="cue-reset">↻${reset}</span>` : ""}
      </div>`;
  });

  let extraHTML = "";
  if (data.extra?.enabled) {
    const e = data.extra;
    const used = e.used != null ? e.used.toLocaleString() : "?";
    const limit = e.limit != null ? e.limit.toLocaleString() : "?";
    extraHTML = `<div class="cue-extra"><span class="cue-key">extra_credits</span> ${used}/${limit}</div>`;
  }

  const age = data.fetchedAt
    ? `fetched ${Math.round((Date.now() - data.fetchedAt) / 60_000)}m ago`
    : "";

  return `<div class="cue-header">✳ claude-usage</div>${rows.join("")}${extraHTML}<div class="cue-age">${age}</div>`;
}

function getOrCreateWidget() {
  let el = document.getElementById(WIDGET_ID);
  if (el) return el;

  el = document.createElement("div");
  el.id = WIDGET_ID;
  el.title = "Claude Usage";
  el.innerHTML = `<span class="cue-badge-ps1">✳</span><span id="cue-badge-label">…</span>`;

  const tooltip = document.createElement("div");
  tooltip.id = TOOLTIP_ID;
  tooltip.innerHTML = "Loading…";

  document.body.appendChild(el);
  document.body.appendChild(tooltip);

  injectStyles();

  el.addEventListener("mouseenter", () => {
    tooltip.style.display = "block";
  });
  el.addEventListener("mouseleave", () => {
    tooltip.style.display = "none";
  });
  tooltip.addEventListener("mouseenter", () => {
    tooltip.style.display = "block";
  });
  tooltip.addEventListener("mouseleave", () => {
    tooltip.style.display = "none";
  });

  el.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "fetchNow" });
  });

  return el;
}

function updateWidget(data, error) {
  const widget = getOrCreateWidget();
  const label = document.getElementById("cue-badge-label");
  const tooltip = document.getElementById(TOOLTIP_ID);

  if (error) {
    label.textContent = "err";
    label.style.color = COLORS.critical;
    tooltip.innerHTML = `<div class="cue-header">✳ claude-usage</div><span style="color:#c0392b">error: ${error}</span>`;
    return;
  }

  if (!data || !data.windows.length) {
    label.textContent = "--";
    label.style.color = COLORS.muted;
    tooltip.innerHTML = `<div class="cue-header">✳ claude-usage</div><span style="color:#7a7068">no data — open claude.ai</span>`;
    return;
  }

  const maxUtil = Math.max(...data.windows.map((w) => w.utilization ?? 0));
  const color = colorForUtilization(maxUtil);
  label.textContent = pct(maxUtil);
  label.style.color = color;

  tooltip.innerHTML = buildTooltipHTML(data);
}

// ─── Styles ──────────────────────────────────────────────────────────────────

function injectStyles() {
  let s = document.getElementById("cue-styles");
  if (!s) {
    s = document.createElement("style");
    s.id = "cue-styles";
    document.head.appendChild(s);
  }
  s.textContent = `
    #${WIDGET_ID} {
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 2147483647;
      background: #f5f0eb;
      color: #1a1a1a;
      border: 1px solid #d6cfc8;
      border-left: 3px solid #c96442;
      padding: 4px 10px;
      font: 500 11px/1.5 'JetBrains Mono','Fira Mono','Cascadia Code',monospace;
      cursor: pointer;
      box-shadow: 0 2px 8px rgba(0,0,0,0.12);
      user-select: none;
      display: flex;
      align-items: center;
      gap: 5px;
    }
    #${WIDGET_ID}:hover { background: #ede8e2; }
    .cue-badge-ps1 { color: #c96442; font-size: 12px; }

    #${TOOLTIP_ID} {
      display: none;
      position: fixed;
      bottom: 54px;
      right: 20px;
      z-index: 2147483647;
      background: #f5f0eb;
      color: #1a1a1a;
      border: 1px solid #d6cfc8;
      border-left: 3px solid #c96442;
      padding: 10px 12px;
      font: 11px/1.7 'JetBrains Mono','Fira Mono','Cascadia Code',monospace;
      min-width: 260px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.14);
    }

    .cue-header {
      font-weight: 700;
      color: #c96442;
      margin-bottom: 6px;
      font-size: 11px;
      letter-spacing: .04em;
    }
    .cue-row {
      display: flex;
      align-items: baseline;
      gap: 5px;
      margin-bottom: 2px;
      white-space: nowrap;
    }
    .cue-label { min-width: 88px; font-size: 10px; color: #7a7068; }
    .cue-bar   { font-size: 10px; letter-spacing: -0.5px; }
    .cue-pct   { min-width: 36px; font-size: 11px; font-weight: 700; text-align: right; }
    .cue-reset { font-size: 10px; color: #7a7068; white-space: nowrap; margin-left: 2px; }
    .cue-extra { margin-top: 5px; font-size: 10px; color: #7a7068; border-top: 1px solid #d6cfc8; padding-top: 5px; }
    .cue-key   { color: #1a1a1a; font-weight: 700; }
    .cue-age   { margin-top: 4px; font-size: 9px; color: #b0a89e; text-align: right; }
  `;
}

// ─── Audio ───────────────────────────────────────────────────────────────────

let audioCtx = null;

function getAudioCtx() {
  if (!audioCtx || audioCtx.state === "closed") {
    audioCtx = new AudioContext();
  }
  return audioCtx;
}

/**
 * Play a sequence of { freq, duration, type } notes.
 * gain: master volume (0–1).
 */
function playSequence(notes, gain = 0.18) {
  const ctx = getAudioCtx();
  let t = ctx.currentTime + 0.05;

  for (const note of notes) {
    const osc = ctx.createOscillator();
    const env = ctx.createGain();

    osc.connect(env);
    env.connect(ctx.destination);

    osc.type = note.type ?? "sine";
    osc.frequency.setValueAtTime(note.freq, t);

    // soft attack + decay envelope
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(gain, t + 0.02);
    env.gain.exponentialRampToValueAtTime(0.001, t + note.duration);

    osc.start(t);
    osc.stop(t + note.duration + 0.01);

    t += note.duration * 0.85;
  }
}

// depleted: descending minor thirds — melancholic "out of credits" ding-ding-down
function playDepleted() {
  playSequence([
    { freq: 523, duration: 0.18 },  // C5
    { freq: 415, duration: 0.18 },  // G#4
    { freq: 330, duration: 0.32 },  // E4
  ], 0.15);
}

// restored: ascending major chord arpeggio — cheerful "credits back" chime
function playRestored() {
  playSequence([
    { freq: 392, duration: 0.14 },  // G4
    { freq: 494, duration: 0.14 },  // B4
    { freq: 587, duration: 0.14 },  // D5
    { freq: 784, duration: 0.28 },  // G5
  ], 0.16);
}

// ─── Init ────────────────────────────────────────────────────────────────────

function loadFromStorage() {
  chrome.storage.local.get(["usageData", "usageError"], ({ usageData, usageError }) => {
    updateWidget(usageData, usageError);
  });
}

injectStyles();
loadFromStorage();

// Live updates from background
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "usageUpdated") {
    updateWidget(msg.data, null);
  }
  if (msg.type === "playSound") {
    chrome.storage.local.get("soundEnabled", ({ soundEnabled }) => {
      if (soundEnabled === false) return;
      if (msg.sound === "depleted") playDepleted();
      else if (msg.sound === "restored") playRestored();
    });
  }
});

// Refresh display when storage changes (e.g. background updated while page open)
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if ("usageData" in changes || "usageError" in changes) {
    loadFromStorage();
  }
});
