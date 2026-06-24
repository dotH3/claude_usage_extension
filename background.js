/**
 * background.js — service worker
 *
 * Strategy:
 * 1. Read `lastActiveOrg` cookie from claude.ai to get org ID.
 * 2. Fetch https://claude.ai/api/organizations/{org_id}/usage using session cookies.
 *    This is an undocumented internal endpoint used by the web app itself.
 *    It does NOT require API keys — the browser session cookie is enough.
 * 3. Cache result in chrome.storage.local.
 * 4. Poll every POLL_INTERVAL_MINUTES minutes via alarms API.
 *
 * What can break:
 * - `lastActiveOrg` cookie name changes → need to update COOKIE_NAME
 * - Endpoint URL changes → update USAGE_URL_TEMPLATE
 * - Response shape changes → update parseUsage()
 * - Session expiry → 401, handled gracefully
 */

const POLL_INTERVAL_MINUTES = 5;
const ALARM_NAME = "fetchUsage";
const COOKIE_NAME = "lastActiveOrg";
const CLAUDE_DOMAIN = "claude.ai";
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

async function fetchUsage(orgId) {
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

/**
 * Normalize API response into a stable shape for the UI.
 * Known response fields (as of Apr 2026):
 *   five_hour.utilization, five_hour.resets_at
 *   seven_day.utilization, seven_day.resets_at
 *   seven_day_sonnet.utilization, seven_day_sonnet.resets_at
 *   extra_usage.is_enabled, extra_usage.monthly_limit,
 *              extra_usage.used_credits, extra_usage.utilization
 */
function parseUsage(raw) {
  const windows = [];

  const add = (key, label) => {
    const w = raw[key];
    if (!w) return;
    windows.push({
      key,
      label,
      utilization: w.utilization ?? null,
      resetsAt: w.resets_at ?? null,
    });
  };

  add("five_hour", "5-Hour");
  add("seven_day", "7-Day");
  add("seven_day_sonnet", "7-Day Sonnet");
  add("daily", "Daily");
  add("monthly", "Monthly");

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


async function doFetch() {
  try {
    const orgId = await getOrgId();
    if (!orgId) {
      await chrome.storage.local.set({
        usageError: "Not logged in — open claude.ai first",
        usageData: null,
        usageFetchedAt: Date.now(),
      });
      return;
    }

    const raw = await fetchUsage(orgId);
    const data = parseUsage(raw);

    await chrome.storage.local.set({
      usageData: data,
      usageError: null,
      usageFetchedAt: Date.now(),
      orgId,
    });

    // Notify popup
    chrome.runtime.sendMessage({ type: "usageUpdated", data }).catch(() => {});
  } catch (err) {
    await chrome.storage.local.set({
      usageError: err.message,
      usageFetchedAt: Date.now(),
    });
  }
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
