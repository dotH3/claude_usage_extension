// to add dark theme
//
//
chrome.storage.local.get('theme', ({ theme }) => {
  if (theme === 'dark') {
    document.body.classList.add('dark');
  } else if (!theme) {
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      document.body.classList.add('dark');
    }
  }
});

document.body.addEventListener('click', (e) => {
  if (e.target.id === 'theme-btn') {
    document.body.classList.toggle('dark');
    const isDark = document.body.classList.contains('dark');
    chrome.storage.local.set({ theme: isDark ? 'dark' : 'light' });
  }
});

function clampedPct(n) {
  return Math.min(Math.max(Math.round(n ?? 0), 0), 100);
}

function pctLabel(n) {
  return n != null ? `${Math.round(n)}%` : "?%";
}

function severityClass(util) {
  if (util == null) return "ok";
  if (util >= 90) return "critical";
  if (util >= 70) return "warn";
  return "ok";
}

function asciiBar(util) {
  const pct = clampedPct(util);
  const cls = severityClass(util);
  return `<span class="bar-bracket">[</span>` +
         `<span class="bar-track"><span class="bar-fill ${cls}" style="width:${pct}%"></span></span>` +
         `<span class="bar-bracket">]</span>`;
}

function timeUntil(iso) {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "resetting soon";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function renderWindow(w) {
  const cls = severityClass(w.utilization);
  const reset = timeUntil(w.resetsAt);
  const label = w.label.toLowerCase().replace(/\s+/g, '_');
  return `
    <div class="window ${cls}">
      <div class="window-header">
        <span class="window-label">${label}</span>
        <span class="window-pct ${cls}">${pctLabel(w.utilization)}</span>
      </div>
      <div class="term-bar">${asciiBar(w.utilization)}</div>
      ${reset ? `<div class="window-reset"><span class="arrow">↻</span> resets in ${reset}</div>` : ""}
    </div>`;
}

function render({ usageData, usageError, usageFetchedAt }) {
  const content = document.getElementById("content");
  const status = document.getElementById("status");
  const headerStatus = document.getElementById("header-status");

  if (usageFetchedAt) {
    const age = Math.round((Date.now() - usageFetchedAt) / 60_000);
    const ageStr = age === 0 ? "just now" : `${age}m ago`;
    status.textContent = `fetched ${ageStr}`;
    headerStatus.textContent = ageStr;
  }

  if (usageError) {
    content.innerHTML = `<div id="error"><span class="err-label">error:</span> ${usageError}</div>`;
    return;
  }

  if (!usageData || !usageData.windows.length) {
    content.innerHTML = `<div id="error"><span class="err-label">no data</span> — open claude.ai first</div>`;
    return;
  }

  let html = usageData.windows.map(renderWindow).join("");

  if (usageData.extra?.enabled) {
    const e = usageData.extra;
    const used = e.used != null ? e.used.toLocaleString() : "?";
    const limit = e.limit != null ? e.limit.toLocaleString() : "?";
    html += `
      <div class="extra">
        <span class="key">extra_credits</span>  ${used} / ${limit}  (${pctLabel(e.utilization)})
      </div>`;
  }

  content.innerHTML = html;
}

function load() {
  chrome.storage.local.get(
    ["usageData", "usageError", "usageFetchedAt"],
    render
  );
}

// Show cached data immediately, then refresh as soon as the popup opens.
load();
chrome.runtime.sendMessage({ type: "fetchNow" }, () => load());

document.getElementById("refresh-btn").addEventListener("click", function () {
  this.disabled = true;
  this.textContent = "⟳ fetching…";
  chrome.runtime.sendMessage({ type: "fetchNow" }, () => {
    load();
    this.disabled = false;
    this.textContent = "⟳ refresh";
  });
});
