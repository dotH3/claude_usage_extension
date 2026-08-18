const input = document.getElementById("go-api-key");
const message = document.getElementById("message");

function showMessage(text, error = false) {
  message.textContent = text;
  message.style.color = error ? "#ff807d" : "#67d6a0";
}

chrome.storage.local.get("goApiKey", ({ goApiKey }) => {
  if (goApiKey) input.value = goApiKey;
});

document.getElementById("save-btn").addEventListener("click", async () => {
  const goApiKey = input.value.trim();
  if (!goApiKey) {
    showMessage("enter a key before saving", true);
    return;
  }

  await chrome.storage.local.set({ goApiKey });
  showMessage("key saved · fetching usage…");
  chrome.runtime.sendMessage({ type: "fetchNow" }, () => {
    if (chrome.runtime.lastError) return;
    showMessage("key saved · usage will refresh shortly");
  });
});

document.getElementById("clear-btn").addEventListener("click", async () => {
  await chrome.storage.local.remove("goApiKey");
  input.value = "";
  showMessage("OpenCode key removed");
});
