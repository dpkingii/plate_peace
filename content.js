// content.js — QuietPlate

// Matches calorie patterns like "650 calories", "310 cal", "190 kcal", "(190 calories).", "Calories: 190"
const CALORIE_REGEX =
  /\(?\b\d{2,4}\s*(calories?|cals?|kcals?)\b\.?\)?|(calories?|kcals?):\s*\d{2,4}/gi;

// Pass 2 — handles sites like Starbucks that split the number and unit
// across two sibling elements: <span>190</span><span>calories</span>
function scrubSplitNodes(root) {
  // search starting from subtree passed in
  // walker only stops at nodes with actual text
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node;

  while ((node = walker.nextNode())) {
    const text = node.textContent;
    const nextSibling = node.parentElement?.nextElementSibling;

    // Pattern A — number first: <span>190</span><span>calories</span>
    // finds a node that is just a number, then checks if the next sibling is just a calorie word
    if (/^\s*\d{2,4}\s*$/.test(text)) {
      if (
        nextSibling &&
        /^\s*(calories?|cals?|kcals?)\s*$/i.test(nextSibling.textContent)
      ) {
        node.textContent = "";
        nextSibling.style.display = "none";
      }
    }

    // Pattern B — label first: <span>Calories: </span><span>350</span>
    // finds the label first, then checks if the next sibling is just a number
    if (/^\s*(calories?|kcals?)\s*:\s*$/i.test(text)) {
      if (nextSibling && /^\s*\d{2,4}\s*$/.test(nextSibling.textContent)) {
        node.textContent = "";
        nextSibling.style.display = "none";
      }
    }
  }
  // Pattern C — split text nodes inside the same parent (Shake Shack)
  // <span>"680"" cals"</span> — multiple text nodes inside one element
  // reads combined text to detect the pattern without merging nodes (safe for React)
  const allElements = root.querySelectorAll("*");
  allElements.forEach((el) => {
    const textNodes = Array.from(el.childNodes).filter(
      (n) => n.nodeType === Node.TEXT_NODE,
    );
    if (textNodes.length > 1) {
      const combined = textNodes.map((n) => n.textContent).join("");
      if (CALORIE_REGEX.test(combined)) {
        CALORIE_REGEX.lastIndex = 0;
        // blank each text node individually — never merge them, keeps React's virtual DOM intact
        textNodes.forEach((n) => {
          n.nodeValue = n.nodeValue
            .replace(/\d{2,4}/, "")
            .replace(/cals?|kcals?|calories?/gi, "");
        });
      }
      CALORIE_REGEX.lastIndex = 0;
    }
  });
}

function scrubNode(node) {
  // Merge adjacent text nodes within the same parent so the regex
  // can match patterns like "190\ncalories" as a single string

  // Pass 1 — handles sites where number and unit are in the same text node
  // e.g. "Chicken Burrito 650 calories"
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  let current;

  while ((current = walker.nextNode())) {
    if (CALORIE_REGEX.test(current.textContent)) {
      // reset to searach from beginning of string to avoid randomly miss
      // g flag on regex remembers the last matched position when call test()
      CALORIE_REGEX.lastIndex = 0;
      current.nodeValue = current.nodeValue.replace(CALORIE_REGEX, "");
    }
    CALORIE_REGEX.lastIndex = 0;
  }

  // Pass 2 — handles split sibling pattern (e.g. Starbucks)
  scrubSplitNodes(node);
}

let observer = null;

function enableScrubbing() {
  // Initial pass
  scrubNode(document.body);

  // Watch for dynamic content
  observer = new MutationObserver((mutations) => {
    // Disconnect before making any DOM changes
    observer.disconnect();

    mutations.forEach((m) => {
      m.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          scrubNode(node);
        }
      });
    });
    // Reconnect after all changes are done
    observer.observe(document.body, { childList: true, subtree: true });
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

function disableScrubbing() {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  window.location.reload();
}

// On load — check storage and apply if enabled
chrome.storage.sync.get(["enabled"], (result) => {
  if (result.enabled) enableScrubbing();
});

// Listen for toggle messages from the popup
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "SET_ENABLED") {
    msg.enabled ? enableScrubbing() : disableScrubbing();
  }
});
