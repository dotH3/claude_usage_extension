const POLL_INTERVAL_MINUTES = 5;
const ALARM_NAME = "fetchUsage";
const COOKIE_NAME = "lastActiveOrg";
const CLAUDE_DOMAIN = "claude.ai";
const OPENCODE_USAGE_URL = "https://opencode.ai/zen/go/v1/usage";
const DAEMON_URL = "http://localhost:19876/usage";
const USAGE_URL_TEMPLATE = (orgId) =>
  `https://claude.ai/api/organizations/${orgId}/usage`;

async function getOrgId() {
  return new Promise((resolve) => {
    chrome.cookies.get(
      { url: `https://${CLAUDE_DOMAIN}`, name: COOKIE_NAME },
      (cookie) => resolve(cookie ? cookie.value : null)
    );
  });
}

async function fetchClaudeUsage(orgId) {
  const url = USAGE_URL_TEMPLATE(orgId);
  const resp = await fetch(url, {
    credentials: "include",
    headers: { "x-requested-with": "XMLHttpRequest" },
  });

  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status}`);
  }

  return resp.json();
}

function parseClaudeUsage(raw) {
  const windows = [];

  const add = (key, label) => {
    const w = raw[key];
    if (!w) return;
    windows.push({
      source: "claude",
      key,
      label,
      utilization: w.utilization ?? null,
      resetsAt: w.resets_at ?? null,
    });
  };

  // Keep the dashboard focused on the two plan limits used by Claude Code.
  add("five_hour", "Session");
  add("seven_day", "Weekly");

  // Extra (pay-as-you-go) credits
  let extra = null;
  if (raw.extra_usage) {
    const e = raw.extra_usage;
    extra = {
      enabled: e.is_enabled ?? false,
      used: e.used_credits ?? null,
      limit: e.monthly_limit ?? null,
      utilization: e.utilization ?? null,
    };
  }

  return { windows, extra, fetchedAt: Date.now() };
}

async function fetchGoUsage(apiKey) {
  if (!apiKey) return null;

  const resp = await fetch(OPENCODE_USAGE_URL, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
  });

  if (!resp.ok) {
    if (resp.status === 401) throw new Error("invalid OpenCode API key");
    if (resp.status === 403) throw new Error("OpenCode Go subscription required");
    throw new Error(`HTTP ${resp.status}`);
  }

  return resp.json();
}

function parseGoUsage(raw) {
  const windows = [];
  const add = (key, label, data) => {
    if (!data) return;
    windows.push({
      source: "opencode",
      key,
      label,
      utilization: data.percent ?? null,
      resetsAt: data.resetsAt ?? null,
      status: data.status ?? null,
    });
  };

  // The Go plan has three dollar-based limits: $12/5h, $30/week, $60/month.
  add("rolling", "5-Hour", raw?.usage?.rolling);
  add("weekly", "Weekly", raw?.usage?.weekly);
  add("monthly", "Monthly", raw?.usage?.monthly);

  return { windows, fetchedAt: Date.now() };
}

async function fetchClaudeSource() {
  const orgId = await getOrgId();
  if (!orgId) throw new Error("not logged in — open claude.ai first");
  return parseClaudeUsage(await fetchClaudeUsage(orgId));
}

async function fetchGoSource() {
  // 1. Try local daemon (reads auth.json automatically)
  try {
    const resp = await fetch(DAEMON_URL, { signal: AbortSignal.timeout(1500) });
    if (resp.ok) {
      return parseGoUsage(await resp.json());
    }
  } catch (_e) {
    // daemon not running, continue
  }

  // 2. Fallback to manual API key from settings
  const { goApiKey } = await chrome.storage.local.get("goApiKey");
  if (!goApiKey) return { notConfigured: true, windows: [], fetchedAt: Date.now() };
  return parseGoUsage(await fetchGoUsage(goApiKey));
}

/**
 * Use the most utilized window for the toolbar badge so either provider is visible.
 */
function updateBadge(data) {
  const util = data?.windows?.reduce(
    (max, window) => Math.max(max, window.utilization ?? 0),
    0
  );

  if (!data?.windows?.length) {
    chrome.action.setBadgeText({ text: "" });
    return;
  }

  const pct = Math.round(util);
  const color = pct >= 90 ? "#c0392b" : pct >= 70 ? "#b45309" : "#2d6a4f";
  chrome.action.setBadgeBackgroundColor({ color });
  chrome.action.setBadgeText({ text: `${pct}%` });
}

function clearBadge() {
  chrome.action.setBadgeText({ text: "!" });
  chrome.action.setBadgeBackgroundColor({ color: "#888888" });
}

async function doFetch() {
  const [claudeResult, goResult] = await Promise.allSettled([
    fetchClaudeSource(),
    fetchGoSource(),
  ]);

  const errors = {};
  const windows = [];
  let extra = null;
  let orgId = null;

  if (claudeResult.status === "fulfilled") {
    windows.push(...claudeResult.value.windows);
    extra = claudeResult.value.extra;
  } else {
    errors.claude = claudeResult.reason?.message ?? "unable to fetch Claude usage";
  }

  if (goResult.status === "fulfilled") {
    windows.push(...goResult.value.windows);
    if (goResult.value.notConfigured) errors.opencode = "start daemon or add API key in settings";
  } else {
    errors.opencode = goResult.reason?.message ?? "unable to fetch OpenCode usage";
  }

  try {
    orgId = await getOrgId();
  } catch (_err) {
    // The Claude fetch already contains the useful error when cookies are unavailable.
  }

  const data = {
    windows,
    extra,
    errors,
    fetchedAt: Date.now(),
  };
  const usageError = Object.values(errors).filter(Boolean).join(" · ") || null;

  await chrome.storage.local.set({
    usageData: data,
    usageErrors: errors,
    usageError,
    usageFetchedAt: data.fetchedAt,
    orgId,
  });

  if (windows.length) updateBadge(data);
  else clearBadge();

  chrome.runtime.sendMessage({ type: "usageUpdated", data }, () => {
    // Popup and content scripts are optional receivers.
    void chrome.runtime.lastError;
  });
}

// Alarm-based polling (survives service worker sleep)
chrome.alarms.create(ALARM_NAME, {
  delayInMinutes: 0,
  periodInMinutes: POLL_INTERVAL_MINUTES,
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) doFetch();
});

// Allow popup/content to trigger manual refresh
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "fetchNow") {
    doFetch().then(() => sendResponse({ ok: true }));
    return true; // keep channel open for async
  }
});
