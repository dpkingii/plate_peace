import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadPage } from "./support/loadScript.js";

function bodyText(dom) {
  return dom.window.document.body.textContent;
}

describe("scrubNode — single text node (Chipotle/McDonald's style)", () => {
  it.each([
    ["Chicken Burrito 650 calories", "Chicken Burrito"],
    ["Big Mac 550 cal", "Big Mac"],
    ["Protein Bowl 310 kcal", "Protein Bowl"],
    ["Side salad (190 calories).", "Side salad"],
    ["Calories: 190 per serving", "per serving"],
  ])("scrubs %j", (input, expectedRemaining) => {
    const dom = loadPage("content.js", { html: `<p>${input}</p>` });
    dom.window.scrubNode(dom.window.document.body);

    const text = bodyText(dom).trim();
    expect(text).not.toMatch(/\d{2,4}\s*(calories?|cals?|kcals?)/i);
    expect(text).toContain(expectedRemaining);
  });

  it("leaves unrelated numbers alone", () => {
    const dom = loadPage("content.js", {
      html: `<p>Table 12, party of 4 — check total $128.50</p>`,
    });
    dom.window.scrubNode(dom.window.document.body);

    expect(bodyText(dom)).toBe("Table 12, party of 4 — check total $128.50");
  });
});

describe("scrubSplitNodes — sibling patterns", () => {
  it("Pattern A: number then label (Starbucks style)", () => {
    const dom = loadPage("content.js", {
      html: `<div><span id="num">190</span><span id="label">calories</span></div>`,
    });
    dom.window.scrubNode(dom.window.document.body);

    const { document } = dom.window;
    expect(document.getElementById("num").textContent).toBe("");
    expect(document.getElementById("label").style.display).toBe("none");
  });

  it("Pattern B: label then number", () => {
    const dom = loadPage("content.js", {
      html: `<div><span id="label">Calories: </span><span id="num">350</span></div>`,
    });
    dom.window.scrubNode(dom.window.document.body);

    const { document } = dom.window;
    expect(document.getElementById("label").textContent).toBe("");
    expect(document.getElementById("num").style.display).toBe("none");
  });

  it("Pattern C: split text nodes within one element (Shake Shack style)", () => {
    const dom = loadPage("content.js", { html: `<span id="combo"></span>` });
    const { document } = dom.window;

    // Simulate a framework (e.g. React) rendering the number and unit as two
    // separate text nodes inside the same element, without merging them.
    const combo = document.getElementById("combo");
    combo.appendChild(document.createTextNode("680"));
    combo.appendChild(document.createTextNode(" cals"));

    dom.window.scrubNode(document.body);

    expect(combo.textContent.trim()).toBe("");
    // Each text node should still be blanked individually, not merged.
    expect(combo.childNodes).toHaveLength(2);
  });
});

describe("scrubNode — full fixture (test.html)", () => {
  it("removes every calorie mention while keeping menu item names", () => {
    const fixturePath = fileURLToPath(new URL("../test.html", import.meta.url));
    const fixtureHtml = readFileSync(fixturePath, "utf8");
    const bodyMatch = fixtureHtml.match(/<body>([\s\S]*)<\/body>/);
    const dom = loadPage("content.js", { html: bodyMatch[1] });

    dom.window.scrubNode(dom.window.document.body);

    const text = bodyText(dom);
    expect(text).not.toMatch(/\d{2,4}\s*(calories?|cals?|kcals?)/i);
    expect(text).toContain("Chicken Burrito");
    expect(text).toContain("Big Mac");
  });
});

describe("enableScrubbing — dynamic content", () => {
  it("scrubs nodes added after the initial pass via MutationObserver", async () => {
    const dom = loadPage("content.js", { html: `<div id="menu"></div>` });
    const { document } = dom.window;

    dom.window.enableScrubbing();

    const newItem = document.createElement("p");
    newItem.textContent = "Veggie Wrap 420 calories";
    document.getElementById("menu").appendChild(newItem);

    // MutationObserver callbacks fire as a microtask after the current task.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(newItem.textContent).not.toMatch(/\d{2,4}\s*calories/i);
    expect(newItem.textContent).toContain("Veggie Wrap");
  });
});

describe("storage-driven enable/disable", () => {
  it("auto-enables scrubbing on load when storage says enabled", async () => {
    const dom = loadPage("content.js", {
      html: `<p>Chicken Burrito 650 calories</p>`,
      chrome: {
        storage: {
          sync: { get: (_keys, cb) => cb({ enabled: true }) },
        },
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(bodyText(dom)).not.toMatch(/650\s*calories/i);
  });

  it("stops scrubbing new content once disabled via the SET_ENABLED message", async () => {
    let listener;
    const dom = loadPage("content.js", {
      html: `<div id="menu"></div>`,
      chrome: {
        runtime: {
          onMessage: { addListener: (fn) => { listener = fn; } },
        },
      },
    });
    // jsdom doesn't implement navigation; disableScrubbing()'s reload() call
    // just logs a harmless "not implemented" warning here.
    const { document } = dom.window;

    dom.window.enableScrubbing();
    listener({ type: "SET_ENABLED", enabled: false });

    const newItem = document.createElement("p");
    newItem.textContent = "Veggie Wrap 420 calories";
    document.getElementById("menu").appendChild(newItem);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(newItem.textContent).toBe("Veggie Wrap 420 calories");
  });
});
