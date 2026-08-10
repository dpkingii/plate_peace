const mainToggle = document.getElementById("mainToggle");
const mainDesc = document.getElementById("mainDesc");
const themeToggle = document.getElementById("themeToggle");

// Read saved state on open and set the toggles
chrome.storage.sync.get(["enabled", "theme"], (result) => {
  setMainToggle(result.enabled === true);

  // No saved theme yet — fall back to the OS-level preference
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  setTheme(result.theme ? result.theme === "dark" : prefersDark);
});

// Main toggle click
mainToggle.addEventListener("click", () => {
  // aria is a html attribute for accessibility (it would announce "toggle button, pressed")
  // also stores the state of the button (pressed or not) so we dont need "let isEnabled = false;"
  // getAttribute returns the value of the attribute (pressed or not) as string
  const newEnabled = mainToggle.getAttribute("aria-pressed") === "false"; // Flip from current aria-pressed

  chrome.storage.sync.set({ enabled: newEnabled }); // saves the new state to Chrome's storage so it survives page refreshes and browser restarts
  setMainToggle(newEnabled);

  // sends the new state to the content.js so it can start or stop scrubbing the page
  sendToActiveTab({ type: "SET_ENABLED", enabled: newEnabled });
});

// Theme toggle click
themeToggle.addEventListener("click", () => {
  const newDark = themeToggle.getAttribute("aria-pressed") === "false";
  chrome.storage.sync.set({ theme: newDark ? "dark" : "light" });
  setTheme(newDark);
});

// Helpers
function setMainToggle(enabled) {
  mainToggle.setAttribute("aria-pressed", String(enabled));
  mainDesc.textContent = enabled ? "Numbers hidden" : "Numbers visible";
}

function setTheme(isDark) {
  themeToggle.setAttribute("aria-pressed", String(isDark));
  document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
}

// Resets when the popup closes — prevents reload loops on aggressive CDNs like Starbucks
let hasReloaded = false;

function sendToActiveTab(msg) {
  // get all active tabs in the current window
  // async, so tabs only exists inside the callback
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]?.id) return; // check if undefined, return if so

    // send message to content.js
    chrome.tabs.sendMessage(tabs[0].id, msg, () => {
      // callback for after the message is deliever or failed
      // If content.js wasn't injected yet, reload once so it gets injected fresh
      if (chrome.runtime.lastError && msg.enabled && !hasReloaded) {
        hasReloaded = true;
        chrome.tabs.reload(tabs[0].id);
      }
    });
  });
}
