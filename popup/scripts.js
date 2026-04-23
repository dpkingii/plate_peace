
const mainToggle = document.getElementById("mainToggle");
const mainRow = document.getElementById("mainRow");
const mainDesc = document.getElementById("mainDesc");

// Read saved state on open and set the toggle
chrome.storage.sync.get(["enabled"], (result) => {
  setMainToggle(result.enabled === true);
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

// Helpers 
function setMainToggle(enabled) {
  mainToggle.setAttribute("aria-pressed", String(enabled));
  mainRow.classList.toggle("active", enabled);
  mainDesc.textContent = enabled ? "Calorie numbers are hidden" : "Numbers are visible";
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
