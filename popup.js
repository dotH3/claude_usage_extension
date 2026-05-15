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
  return `<span class="filled ${cls}" style="width:${pct}%"></span>`;
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
  return `
    <div class="window ${cls}">
      <div class="window-header">
        <span class="window-label">${w.label}</span>
        <span class="window-pct ${cls}">${pctLabel(w.utilization)}</span>
      </div>
      <div class="ascii-bar">${asciiBar(w.utilization)}</div>
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

// ── Sound toggle ──────────────────────────────────────────────────────────────

const soundToggle = document.getElementById("sound-toggle");

chrome.storage.local.get("soundEnabled", ({ soundEnabled }) => {
  // default ON
  soundToggle.checked = soundEnabled !== false;
});

soundToggle.addEventListener("change", () => {
  chrome.storage.local.set({ soundEnabled: soundToggle.checked });
});

// ─────────────────────────────────────────────────────────────────────────────

load();

document.getElementById("refresh-btn").addEventListener("click", function () {
  this.disabled = true;
  this.textContent = "⟳ fetching…";
  chrome.runtime.sendMessage({ type: "fetchNow" }, () => {
    load();
    this.disabled = false;
    this.textContent = "⟳ refresh";
  });
});
