
const mainToggle = document.getElementById("mainToggle");
const mainRow = document.getElementById("mainRow");
const mainDesc = document.getElementById("mainDesc");

// Read saved state on open 
chrome.storage.sync.get(["enabled"], (result) => {
  setMainToggle(result.enabled === true);
});

// Main toggle click 
mainToggle.addEventListener("click", () => {
  const newEnabled = mainToggle.getAttribute("aria-pressed") !== "true";

  chrome.storage.sync.set({ enabled: newEnabled });
  setMainToggle(newEnabled);

  sendToActiveTab({ type: "SET_ENABLED", enabled: newEnabled });
});

// Helpers 
function setMainToggle(enabled) {
  mainToggle.setAttribute("aria-pressed", String(enabled));
  mainRow.classList.toggle("active", enabled);
  mainDesc.textContent = enabled ? "Calorie numbers are hidden" : "Numbers are visible";
}

// Resets when the popup closes — prevents reload loops on aggressive CDNs like Starbucks
let hasReloaded = false;

function sendToActiveTab(msg) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]?.id) return;
    chrome.tabs.sendMessage(tabs[0].id, msg, () => {
      // If content.js wasn't injected yet, reload once so it gets injected fresh
      if (chrome.runtime.lastError && msg.enabled && !hasReloaded) {
        hasReloaded = true;
        chrome.tabs.reload(tabs[0].id);
      }
    });
  });
}
