const mainToggle = document.getElementById("mainToggle");
const mainDesc = document.getElementById("mainDesc");
const themeToggle = document.getElementById("themeToggle");
const reportLink = document.getElementById("reportLink");

// Google Form "Get pre-filled link" values for the report-a-page form.
const REPORT_FORM_BASE_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLSfGZIQhyQ2ppOo9sntp-HOSdMSX1LCwYJX92ed3WVsS6tvJow/viewform";
const REPORT_FORM_URL_ENTRY = "entry.1674090243";

// Soft spam guard — caps reports per rolling window. This only protects the
// button in the popup; the form itself is a public URL reachable outside the
// extension, so real abuse protection lives in the form's own settings
// (e.g. "Limit to 1 response"), not here.
const REPORT_MAX_PER_WINDOW = 5;
const REPORT_WINDOW_MS = 24 * 60 * 60 * 1000;

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

// Once clicked, the report icon locks for the rest of the browser session —
// but only for the site it was reported on, so moving to a different website
// still offers a fresh report. `reportedHostnames` tracks that per-hostname
// (storage.session, cleared on browser restart); `reportCapReached` is the
// separate daily backstop (storage.local, survives restarts, counts across
// all sites) for someone who restarts the browser specifically to reset the
// session list.
let reportedThisHost = false;
let reportCapReached = false;

function renderReportState() {
  const locked = reportedThisHost || reportCapReached;
  reportLink.classList.toggle("reported", reportedThisHost);
  reportLink.classList.toggle("disabled", locked);
  reportLink.setAttribute("aria-disabled", String(locked));

  if (reportedThisHost) {
    reportLink.setAttribute("data-tooltip", "Thanks for reporting this page!");
  } else if (reportCapReached) {
    reportLink.setAttribute(
      "data-tooltip",
      "You've reported the max for today — thanks for the heads up",
    );
  }
}

// Reflect any earlier reports on open.
chrome.storage.local.get(["reportTimestamps"], (result) => {
  reportCapReached =
    pruneReportTimestamps(result.reportTimestamps || []).length >= REPORT_MAX_PER_WINDOW;
  renderReportState();
});

getActiveTabUrl((pageUrl) => {
  chrome.storage.session.get(["reportedHostnames"], (result) => {
    reportedThisHost = (result.reportedHostnames || []).includes(hostnameOf(pageUrl));
    renderReportState();
  });
});

// Report-this-page click
let reportPending = false;

reportLink.addEventListener("click", (event) => {
  event.preventDefault();

  if (reportLink.classList.contains("disabled") || reportPending) return;
  reportPending = true;

  chrome.storage.local.get(["reportTimestamps"], (result) => {
    const recent = pruneReportTimestamps(result.reportTimestamps || []);

    if (recent.length >= REPORT_MAX_PER_WINDOW) {
      reportCapReached = true;
      renderReportState();
      reportPending = false;
      return;
    }

    recent.push(Date.now());
    chrome.storage.local.set({ reportTimestamps: recent });

    getActiveTabUrl((pageUrl) => {
      chrome.storage.session.get(["reportedHostnames"], (sessionResult) => {
        const hostnames = sessionResult.reportedHostnames || [];
        const hostname = hostnameOf(pageUrl);

        if (!hostnames.includes(hostname)) {
          chrome.storage.session.set({ reportedHostnames: [...hostnames, hostname] });
        }
        reportedThisHost = true;
        renderReportState();

        chrome.tabs.create({ url: buildReportUrl(pageUrl) });
        reportPending = false;
      });
    });
  });
});

// Helpers
function getActiveTab(callback) {
  // async, so the tab only exists inside the callback
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => callback(tabs[0]));
}

function getActiveTabUrl(callback) {
  getActiveTab((tab) => callback(tab?.url || ""));
}

function hostnameOf(pageUrl) {
  try {
    return new URL(pageUrl).hostname;
  } catch {
    return pageUrl;
  }
}

function buildReportUrl(pageUrl) {
  const params = new URLSearchParams({
    usp: "pp_url",
    [REPORT_FORM_URL_ENTRY]: pageUrl,
  });
  return `${REPORT_FORM_BASE_URL}?${params.toString()}`;
}

function pruneReportTimestamps(timestamps) {
  const cutoff = Date.now() - REPORT_WINDOW_MS;
  return timestamps.filter((t) => t > cutoff);
}

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
  getActiveTab((tab) => {
    if (!tab?.id) return; // check if undefined, return if so

    // send message to content.js
    chrome.tabs.sendMessage(tab.id, msg, () => {
      // callback for after the message is deliever or failed
      // If content.js wasn't injected yet, reload once so it gets injected fresh
      if (chrome.runtime.lastError && msg.enabled && !hasReloaded) {
        hasReloaded = true;
        chrome.tabs.reload(tab.id);
      }
    });
  });
}
