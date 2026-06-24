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

function asciiBar(util) {
  const pct = Math.min(Math.max(Math.round(util ?? 0), 0), 100);
  const sev = severityOf(util);
  return `<span class="cue-bracket">[</span>` +
         `<span class="cue-track"><span class="cue-fill cue-${sev}" style="width:${pct}%"></span></span>` +
         `<span class="cue-bracket">]</span>`;
}

// ─── Render ──────────────────────────────────────────────────────────────────

function buildTooltipHTML(data) {
  if (!data) return "<em>no data</em>";

  const rows = data.windows.map((w) => {
    const color = colorForUtilization(w.utilization);
    const reset = timeUntil(w.resetsAt);
    const bar = asciiBar(w.utilization);
    const label = w.label.toLowerCase().replace(/\s+/g, "_");
    return `
      <div class="cue-line">
        <span class="cue-label">${label}</span>
        <span class="cue-pct" style="color:${color}">${pct(w.utilization)}</span>
      </div>
      <div class="cue-row">
        <span class="cue-bar">${bar}</span>
        ${reset ? `<span class="cue-reset">↻ ${reset}</span>` : ""}
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

  return `${tooltipHeader()}${rows.join("")}${extraHTML}<div class="cue-age">${age}</div>`;
}

function tooltipHeader() {
  return `<div class="cue-header"><span class="cue-star">✳</span> claude-usage</div>`;
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
    tooltip.innerHTML = `${tooltipHeader()}<div class="cue-msg" style="color:#c0392b">error: ${error}</div>`;
    return;
  }

  if (!data || !data.windows.length) {
    label.textContent = "--";
    label.style.color = COLORS.muted;
    tooltip.innerHTML = `${tooltipHeader()}<div class="cue-msg" style="color:#7a7068">no data — open claude.ai</div>`;
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
      padding: 5px 11px;
      font: 500 11px/1.5 'JetBrains Mono','Fira Mono','Cascadia Code',monospace;
      cursor: pointer;
      box-shadow: 0 2px 10px rgba(0,0,0,0.14);
      user-select: none;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    #${WIDGET_ID}:hover { background: #ede8e2; }
    .cue-badge-ps1 { color: #c96442; font-size: 12px; font-weight: 700; }
    #cue-badge-label { font-weight: 700; }

    #${TOOLTIP_ID} {
      display: none;
      position: fixed;
      bottom: 56px;
      right: 20px;
      z-index: 2147483647;
      background: #f5f0eb;
      color: #1a1a1a;
      border: 1px solid #d6cfc8;
      border-left: 3px solid #c96442;
      padding: 10px 12px;
      font: 11px/1.6 'JetBrains Mono','Fira Mono','Cascadia Code',monospace;
      width: 250px;
      box-shadow: 0 6px 20px rgba(0,0,0,0.18);
    }

    .cue-header { font-size: 11px; font-weight: 700; color: #1a1a1a; margin-bottom: 8px; }
    .cue-star { color: #c96442; font-weight: 700; }

    .cue-line {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin-bottom: 3px;
    }
    .cue-row {
      display: flex;
      align-items: center;
      gap: 5px;
      margin-bottom: 8px;
    }
    .cue-label   { font-size: 10px; font-weight: 700; color: #1a1a1a; }
    .cue-pct     { font-size: 11px; font-weight: 700; }
    .cue-bar     { display: flex; align-items: center; gap: 4px; flex: 1; min-width: 0; }
    .cue-bracket { color: #7a7068; }
    .cue-track   { flex: 1; height: 10px; background: #c4bbb1; overflow: hidden; }
    .cue-fill    {
      display: block; height: 100%; min-width: 2px;
      transition: width .45s cubic-bezier(.4,0,.2,1);
    }
    .cue-fill.ok {
      background: linear-gradient(180deg, #52b788, #2d6a4f);
      box-shadow: 0 0 6px rgba(64,145,108,.6);
    }
    .cue-fill.warn {
      background: linear-gradient(180deg, #f59e0b, #b45309);
      box-shadow: 0 0 6px rgba(217,119,6,.6);
    }
    .cue-fill.critical {
      background: linear-gradient(180deg, #ef5350, #c0392b);
      box-shadow: 0 0 7px rgba(231,76,60,.65);
    }
    .cue-reset   { font-size: 10px; color: #7a7068; white-space: nowrap; }
    .cue-extra   { padding-top: 7px; font-size: 10px; color: #7a7068; border-top: 1px dashed #d6cfc8; }
    .cue-key     { color: #c96442; font-weight: 700; }
    .cue-age     { margin-top: 5px; font-size: 9px; color: #b0a89e; text-align: right; }

    /* ── dark theme ── */
    #${WIDGET_ID}.cue-dark {
      background: #0d0d0d;
      color: #e8e8e8;
      border-color: #2a2a2a;
      border-left-color: #ff8c69;
    }
    #${WIDGET_ID}.cue-dark:hover { background: #161616; }
    #${WIDGET_ID}.cue-dark .cue-badge-ps1 { color: #ff8c69; }

    #${TOOLTIP_ID}.cue-dark {
      background: #0d0d0d;
      color: #e8e8e8;
      border-color: #2a2a2a;
      border-left-color: #ff8c69;
    }
    #${TOOLTIP_ID}.cue-dark .cue-header { color: #e8e8e8; }
    #${TOOLTIP_ID}.cue-dark .cue-star { color: #ff8c69; }
    #${TOOLTIP_ID}.cue-dark .cue-label { color: #e8e8e8; }
    #${TOOLTIP_ID}.cue-dark .cue-bracket,
    #${TOOLTIP_ID}.cue-dark .cue-reset { color: #888888; }
    #${TOOLTIP_ID}.cue-dark .cue-track { background: #3a3a3a; }
    #${TOOLTIP_ID}.cue-dark .cue-key { color: #ff8c69; }
    #${TOOLTIP_ID}.cue-dark .cue-extra { color: #888888; border-top-color: #2a2a2a; }
  `;
}
// ─── Init ────────────────────────────────────────────────────────────────────

//to apply dark theme
function applyTheme(theme) {
  const widget = document.getElementById(WIDGET_ID);
  const tooltip = document.getElementById(TOOLTIP_ID);
  const isDark = theme === 'dark';
  [widget, tooltip].forEach(el => {
    if (!el) return;
    el.classList.toggle('cue-dark', isDark);
  });
}

function loadFromStorage() {
  chrome.storage.local.get(["usageData", "usageError","theme"], ({ usageData, usageError, theme }) => {
    updateWidget(usageData, usageError);
	  applyTheme(theme);
  });
}

injectStyles();
loadFromStorage();

// Apply on load
//chrome.storage.local.get('theme', ({ theme }) => applyTheme(theme));

// React to changes in real time
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.theme) {
    applyTheme(changes.theme.newValue);
  }
});


// Live updates from background
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "usageUpdated") {
    updateWidget(msg.data, null);
  }
});

// Refresh display when storage changes (e.g. background updated while page open)
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if ("usageData" in changes || "usageError" in changes) {
    loadFromStorage();
  }
});
