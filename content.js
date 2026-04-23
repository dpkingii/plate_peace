// content.js — Plate Peace

console.log("PlatePeace content.js loaded");

// Matches calorie patterns like "650 calories", "310 cal", "190 kcal", "(190 calories)."
const CALORIE_REGEX = /\(?\b\d{2,4}\s*(calories?|cals?|kcals?)\b\.?\)?/gi;

// Pass 2 — handles sites like Starbucks that split the number and unit
// across two sibling elements: <span>190</span><span>calories</span>
function scrubSplitNodes(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (/^\s*\d{2,4}\s*$/.test(node.textContent)) {
        const nextSibling = node.parentElement?.nextElementSibling;
        if (nextSibling && /^\s*(calories?|cals?|kcals?)\s*$/i.test(nextSibling.textContent)) {
          node.textContent = "";
          nextSibling.style.display = "none";
        }
      }
    }
  }
  
  function scrubNode(node) {

    // Merge adjacent text nodes within the same parent so the regex
    // can match patterns like "190\ncalories" as a single string
    node.normalize();

    // Pass 1 — handles sites where number and unit are in the same text node
    // e.g. "Chicken Burrito 650 calories"
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    let current;
    while ((current = walker.nextNode())) {
      if (CALORIE_REGEX.test(current.textContent)) {
        CALORIE_REGEX.lastIndex = 0;
        current.textContent = current.textContent.replace(CALORIE_REGEX, "");
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
    mutations.forEach((m) => {
      m.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          scrubNode(node);
        }
      });
    });
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

function disableScrubbing() {
  if (observer) { observer.disconnect(); observer = null; }
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