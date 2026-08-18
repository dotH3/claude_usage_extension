const WIDGET_ID = "usage-monitor-widget";
const TOOLTIP_ID = "usage-monitor-tooltip";

function severity(value) {
  if (value >= 90) return "critical";
  if (value >= 70) return "warn";
  return "ok";
}

function timeUntil(iso) {
  if (!iso) return "reset unknown";
  const milliseconds = new Date(iso).getTime() - Date.now();
  if (milliseconds <= 0) return "resetting soon";
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor((milliseconds % 3_600_000) / 60_000);
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function pct(value) {
  return value == null ? "?" : `${Math.round(value)}%`;
}

function sourceName(source) {
  return source === "opencode" ? "OpenCode Go" : "Claude / Claude Code";
}

function normalizeWindows(windows) {
  return (windows ?? []).map((window) => ({
    ...window,
    // Data saved by v1 predates the source field and is Claude usage.
    source: window.source ?? "claude",
  }));
}

function windowName(window) {
  if (window.source !== "opencode") return window.label;
  return { rolling: "5-hour", weekly: "weekly", monthly: "monthly" }[window.key] ?? window.label;
}

function bar(window) {
  const value = Math.min(Math.max(Math.round(window.utilization ?? 0), 0), 100);
  const cls = severity(window.utilization ?? 0);
  return `<div class="um-bar"><span class="um-fill um-${cls}" style="width:${value}%"></span></div>`;
}

function buildTooltip(data, error) {
  const windows = normalizeWindows(data?.windows);
  const bySource = {
    claude: windows.filter((window) => window.source === "claude"),
    opencode: windows.filter((window) => window.source === "opencode"),
  };
  const groups = Object.entries(bySource)
    .filter(([, sourceWindows]) => sourceWindows.length)
    .map(([source, sourceWindows]) => `<div class="um-source"><div class="um-source-title"><span class="um-dot um-${source}"></span>${sourceName(source)}</div>${sourceWindows.map((window) => `<div class="um-window"><div class="um-window-head"><strong>${windowName(window)}</strong><b class="um-${severity(window.utilization ?? 0)}">${pct(window.utilization)}</b></div>${bar(window)}<div class="um-window-foot"><span>${window.status && window.status !== "ok" ? window.status : "usage"}</span><span>↻ ${timeUntil(window.resetsAt)}</span></div></div>`).join("")}</div>`)
    .join("");
  const errors = Object.entries(data?.errors ?? {}).filter(([, value]) => value).map(([source, value]) => `<div class="um-error">${sourceName(source)}: ${value}</div>`).join("");
  const empty = !windows.length ? `<div class="um-empty">No usage data yet.<br>Open settings to connect OpenCode Go.</div>` : "";
  const age = data?.fetchedAt ? `updated ${Math.max(0, Math.round((Date.now() - data.fetchedAt) / 60_000))}m ago` : "waiting for data";
  return `<div class="um-head"><span class="um-mark">✳</span><strong>usage monitor</strong><span>${age}</span></div>${groups}${empty}${errors}`;
}

function getOrCreateWidget() {
  let widget = document.getElementById(WIDGET_ID);
  if (widget) return widget;

  widget = document.createElement("button");
  widget.id = WIDGET_ID;
  widget.type = "button";
  widget.innerHTML = `<span class="um-widget-mark">✳</span><span id="um-widget-value">--</span><span class="um-widget-label">usage</span>`;

  const tooltip = document.createElement("div");
  tooltip.id = TOOLTIP_ID;
  tooltip.hidden = true;
  tooltip.innerHTML = "Loading…";

  document.body.append(widget, tooltip);
  injectStyles();

  const show = () => { tooltip.hidden = false; };
  const hide = () => { tooltip.hidden = true; };
  widget.addEventListener("mouseenter", show);
  widget.addEventListener("mouseleave", () => window.setTimeout(() => { if (!tooltip.matches(":hover")) hide(); }, 60));
  tooltip.addEventListener("mouseleave", hide);
  widget.addEventListener("click", () => chrome.runtime.sendMessage({ type: "fetchNow" }));
  return widget;
}

function updateWidget(data, error) {
  const widget = getOrCreateWidget();
  const label = document.getElementById("um-widget-value");
  const tooltip = document.getElementById(TOOLTIP_ID);
  const windows = normalizeWindows(data?.windows);
  const max = windows.reduce((value, window) => Math.max(value, window.utilization ?? 0), 0);
  const cls = severity(max);

  label.textContent = windows.length ? pct(max) : "--";
  label.className = `um-${cls}`;
  tooltip.innerHTML = buildTooltip(data, error);
}

function injectStyles() {
  if (document.getElementById("usage-monitor-styles")) return;
  const style = document.createElement("style");
  style.id = "usage-monitor-styles";
  style.textContent = `
    #${WIDGET_ID}, #${TOOLTIP_ID} { --um-bg:#0d1117; --um-panel:#151b23; --um-line:#293442; --um-text:#e7edf3; --um-muted:#8c9aaa; --um-accent:#ff9274; --um-go:#78c7c3; --um-ok:#67d6a0; --um-warn:#f0b567; --um-critical:#ff7773; }
    #${WIDGET_ID} {
      position:fixed; right:20px; bottom:20px; z-index:2147483647; display:flex; align-items:center; gap:7px;
      padding:8px 11px; border:1px solid var(--um-line); border-left:2px solid var(--um-accent); background:var(--um-bg); color:var(--um-text);
      box-shadow:0 10px 30px rgba(0,0,0,.24); cursor:pointer; font:700 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace; user-select:none;
    }
    #${WIDGET_ID}:hover { background:var(--um-panel); }
    .um-widget-mark { color:var(--um-accent); font-size:13px; }
    .um-widget-label { color:var(--um-muted); font-size:9px; font-weight:400; letter-spacing:.1em; text-transform:uppercase; }
    .um-ok { color:var(--um-ok)!important; } .um-warn { color:var(--um-warn)!important; } .um-critical { color:var(--um-critical)!important; }
    #${TOOLTIP_ID} {
      position:fixed; right:20px; bottom:61px; z-index:2147483647; width:310px; padding:13px; border:1px solid var(--um-line); border-left:2px solid var(--um-accent);
      background:var(--um-bg); color:var(--um-text); box-shadow:0 16px 45px rgba(0,0,0,.3); font:11px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;
    }
    #${TOOLTIP_ID}[hidden] { display:none; }
    .um-head { display:flex; align-items:center; gap:7px; padding-bottom:10px; margin-bottom:10px; border-bottom:1px solid var(--um-line); }
    .um-head .um-mark { color:var(--um-accent); font-size:13px; } .um-head span:last-child { margin-left:auto; color:var(--um-muted); font-size:9px; }
    .um-source { margin-bottom:11px; } .um-source:last-of-type { margin-bottom:0; }
    .um-source-title { display:flex; align-items:center; gap:7px; margin-bottom:7px; color:var(--um-muted); font-size:9px; font-weight:700; letter-spacing:.1em; text-transform:uppercase; }
    .um-dot { display:inline-block; width:6px; height:6px; background:var(--um-accent); } .um-dot.um-opencode { background:var(--um-go); }
    .um-window { padding:5px 0 8px; } .um-window-head,.um-window-foot { display:flex; justify-content:space-between; align-items:baseline; }
    .um-window-head b { font-size:12px; } .um-window-foot { margin-top:5px; color:var(--um-muted); font-size:9px; }
    .um-bar { height:7px; margin-top:6px; overflow:hidden; background:#26313d; } .um-fill { display:block; height:100%; min-width:2px; }
    .um-fill.um-ok { background:var(--um-ok); } .um-fill.um-warn { background:var(--um-warn); } .um-fill.um-critical { background:var(--um-critical); }
    .um-error { margin-top:8px; padding-top:8px; border-top:1px dashed var(--um-line); color:var(--um-critical); font-size:9px; }
    .um-empty { color:var(--um-muted); font-size:10px; text-align:center; }
    #${WIDGET_ID}.um-light, #${TOOLTIP_ID}.um-light { --um-bg:#fffdfa; --um-panel:#f4efe9; --um-line:#ded7cf; --um-text:#1c2329; --um-muted:#737b80; --um-accent:#c76548; --um-go:#287e7a; --um-ok:#287d61; --um-warn:#a6661c; --um-critical:#c84543; }
  `;
  document.head.appendChild(style);
}

function applyTheme(theme) {
  const widget = document.getElementById(WIDGET_ID);
  const tooltip = document.getElementById(TOOLTIP_ID);
  const isLight = theme === "light" || (!theme && !window.matchMedia("(prefers-color-scheme: dark)").matches);
  [widget, tooltip].forEach((element) => element?.classList.toggle("um-light", isLight));
}

injectStyles();
chrome.storage.local.get(["usageData", "usageError", "theme"], ({ usageData, usageError, theme }) => {
  updateWidget(usageData, usageError);
  applyTheme(theme);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.theme) applyTheme(changes.theme.newValue);
  if (changes.usageData || changes.usageError) updateWidget(changes.usageData?.newValue, changes.usageError?.newValue);
});

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "usageUpdated") updateWidget(message.data, null);
});
