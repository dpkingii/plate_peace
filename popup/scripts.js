const mainToggle = document.getElementById("mainToggle");
const mainDesc = document.getElementById("mainDesc");
const themeToggle = document.getElementById("themeToggle");

// Cached from the last resolved theme so it can be applied synchronously on
// the next open, without waiting on the async chrome.storage.sync round trip
// (avoids a light-mode flash for dark-mode users). The <head> inline script
// does the same lookup even earlier, before first paint.
const cachedTheme = localStorage.getItem("theme");
if (cachedTheme) setTheme(cachedTheme === "dark");

// Set on click so the async storage.get callback below (which can resolve
// after a fast click) doesn't clobber a toggle the user already changed.
let mainTouched = false;
let themeTouched = false;

// Read saved state on open and set the toggles
chrome.storage.sync.get(["enabled", "theme"], (result) => {
  if (!mainTouched) setMainToggle(result.enabled === true);

  if (!themeTouched) {
    // No saved theme yet — fall back to the OS-level preference
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    setTheme(result.theme ? result.theme === "dark" : prefersDark);
  }
});

// Main toggle click
mainToggle.addEventListener("click", () => {
  mainTouched = true;

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
  themeTouched = true;

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
  localStorage.setItem("theme", isDark ? "dark" : "light");
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
