const content = document.getElementById("content");
const status = document.getElementById("status");
const headerAge = document.getElementById("header-age");

function applyTheme(theme) {
  const dark = theme === "dark" || (!theme && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.body.classList.toggle("light", !dark);
}

chrome.storage.local.get("theme", ({ theme }) => applyTheme(theme));

function ageLabel(timestamp) {
  if (!timestamp) return "waiting";
  const minutes = Math.max(0, Math.round((Date.now() - timestamp) / 60_000));
  return minutes === 0 ? "just now" : `${minutes}m ago`;
}

function clampedPct(value) {
  return Math.min(Math.max(Math.round(value ?? 0), 0), 100);
}

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

function sourceLabel(source) {
  return source === "opencode" ? "OpenCode Go" : "Claude / Claude Code";
}

function normalizeWindows(windows) {
  return (windows ?? []).map((window) => ({
    ...window,
    // Data saved by v1 predates the source field and is Claude usage.
    source: window.source ?? "claude",
  }));
}

function windowLabel(window) {
  if (window.source === "opencode") {
    return { rolling: "5-hour", weekly: "weekly", monthly: "monthly" }[window.key] ?? window.label;
  }
  return window.label;
}

function renderWindow(window) {
  const pct = clampedPct(window.utilization);
  const cls = severity(window.utilization ?? 0);
  const sourceClass = window.source === "opencode" ? "go-reset" : "";
  const remaining = window.utilization == null ? "— remaining" : `${Math.max(0, 100 - Math.round(window.utilization))}% remaining`;
  return `<div class="window">
    <div class="window-top"><span class="window-label">${windowLabel(window)}</span><span class="window-meta"><span class="window-left">${remaining}</span><span class="window-pct ${cls}">${window.utilization == null ? "?" : `${Math.round(window.utilization)}%`}</span></span></div>
    <div class="bar" aria-label="${pct}% used"><span class="fill ${cls}" style="width:${pct}%"></span></div>
    <div class="window-bottom"><span>${window.status && window.status !== "ok" ? window.status : "usage"}</span><span class="reset ${sourceClass}">${timeUntil(window.resetsAt)}</span></div>
  </div>`;
}

function renderSource(source, windows) {
  if (!windows.length) return "";
  const go = source === "opencode";
  return `<section class="source-group">
    <div class="source-heading"><span class="source-dot ${go ? "go" : ""}"></span><span class="source-name">${sourceLabel(source)}</span><span class="source-note">${windows.length} windows</span></div>
    ${windows.map(renderWindow).join("")}
  </section>`;
}

function render({ usageData, usageError, usageFetchedAt }) {
  const data = usageData ?? { windows: [], errors: {} };
  const windows = normalizeWindows(data.windows);
  const claude = windows.filter((window) => window.source === "claude");
  const go = windows.filter((window) => window.source === "opencode");
  const errors = Object.entries(data.errors ?? {}).filter(([, value]) => value);
  const age = ageLabel(usageFetchedAt || data.fetchedAt);

  headerAge.textContent = age;
  status.textContent = usageError ? "partial data · check source status" : `updated ${age}`;

  if (!windows.length) {
    content.innerHTML = `<div class="empty"><strong>No usage data yet</strong>Open claude.ai or add your OpenCode Go key in settings.</div>${renderErrors(errors)}`;
    return;
  }

  content.innerHTML = `${renderSource("claude", claude)}${renderSource("opencode", go)}${data.extra?.enabled ? renderExtra(data.extra) : ""}${renderErrors(errors)}`;
}

function renderExtra(extra) {
  const used = extra.used == null ? "?" : extra.used.toLocaleString();
  const limit = extra.limit == null ? "?" : extra.limit.toLocaleString();
  return `<div class="extra"><strong>extra credits</strong> · ${used} / ${limit} · ${extra.utilization == null ? "?" : Math.round(extra.utilization)}% used</div>`;
}

function renderErrors(errors) {
  if (!errors.length) return "";
  return errors.map(([source, message]) => `<div class="notice ${source === "claude" ? "error" : ""}"><strong>${sourceLabel(source)}:</strong> ${message}${source === "opencode" && message.includes("settings") ? ' · <a data-open-options="true">open settings</a>' : ""}</div>`).join("");
}

function load() {
  chrome.storage.local.get(["usageData", "usageError", "usageFetchedAt"], render);
}

document.getElementById("theme-btn").addEventListener("click", () => {
  const isDark = !document.body.classList.contains("light");
  document.body.classList.toggle("light", isDark);
  chrome.storage.local.set({ theme: isDark ? "light" : "dark" });
});

document.getElementById("options-btn").addEventListener("click", () => chrome.runtime.openOptionsPage());
content.addEventListener("click", (event) => {
  if (event.target.closest("[data-open-options]")) chrome.runtime.openOptionsPage();
});

const refresh = document.getElementById("refresh-btn");
refresh.addEventListener("click", () => {
  refresh.disabled = true;
  refresh.textContent = "fetching…";
  chrome.runtime.sendMessage({ type: "fetchNow" }, () => {
    load();
    refresh.disabled = false;
    refresh.textContent = "refresh";
  });
});

load();
chrome.runtime.sendMessage({ type: "fetchNow" }, () => load());
