import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadPage } from "./support/loadScript.js";

function popupBodyHtml() {
  const path = fileURLToPath(new URL("../popup/index.html", import.meta.url));
  const html = readFileSync(path, "utf8");
  return html.match(/<body>([\s\S]*)<\/body>/)[1];
}

function loadPopup(chromeOverrides = {}) {
  return loadPage("popup/scripts.js", {
    html: popupBodyHtml(),
    chrome: chromeOverrides,
  });
}

describe("main toggle", () => {
  it("starts off when nothing is stored", () => {
    const dom = loadPopup();
    const mainToggle = dom.window.document.getElementById("mainToggle");

    expect(mainToggle.getAttribute("aria-pressed")).toBe("false");
    expect(dom.window.document.getElementById("mainDesc").textContent).toBe(
      "Numbers visible",
    );
  });

  it("starts on when storage says enabled", () => {
    const dom = loadPopup({
      storage: { sync: { get: (_keys, cb) => cb({ enabled: true }) } },
    });

    expect(dom.window.document.getElementById("mainToggle").getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(dom.window.document.getElementById("mainDesc").textContent).toBe(
      "Numbers hidden",
    );
  });

  it("flips state, persists it, and messages the active tab on click", () => {
    const set = vi.fn();
    const sendMessage = vi.fn((_id, _msg, cb) => cb?.());
    const dom = loadPopup({
      storage: { sync: { get: (_keys, cb) => cb({}), set } },
      tabs: { sendMessage },
    });

    dom.window.document.getElementById("mainToggle").click();

    expect(set).toHaveBeenCalledWith({ enabled: true });
    expect(sendMessage).toHaveBeenCalledWith(
      1,
      { type: "SET_ENABLED", enabled: true },
      expect.any(Function),
    );
    expect(
      dom.window.document.getElementById("mainToggle").getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("reloads the tab once if the content script wasn't injected yet", () => {
    const reload = vi.fn();
    let chromeRef;
    const sendMessage = vi.fn((_id, _msg, cb) => {
      chromeRef.runtime.lastError = { message: "no receiver" };
      cb?.();
    });
    const dom = loadPopup({
      runtime: { lastError: null },
      tabs: { sendMessage, reload },
    });
    chromeRef = dom.window.chrome;

    dom.window.document.getElementById("mainToggle").click();

    expect(reload).toHaveBeenCalledOnce();
  });
});

describe("theme toggle", () => {
  it("defaults to the OS color scheme when nothing is stored", () => {
    const dom = loadPage("popup/scripts.js", {
      html: popupBodyHtml(),
      setup: (window) => {
        window.matchMedia = () => ({ matches: true }); // pretend OS prefers dark
      },
    });

    expect(dom.window.document.documentElement.getAttribute("data-theme")).toBe(
      "dark",
    );
    expect(
      dom.window.document.getElementById("themeToggle").getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("uses the stored theme over the OS preference", () => {
    const dom = loadPopup({
      storage: { sync: { get: (_keys, cb) => cb({ theme: "dark" }) } },
    });

    expect(dom.window.document.documentElement.getAttribute("data-theme")).toBe(
      "dark",
    );
    expect(
      dom.window.document.getElementById("themeToggle").getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("toggles data-theme and persists the choice on click", () => {
    const set = vi.fn();
    const dom = loadPopup({
      storage: { sync: { get: (_keys, cb) => cb({ theme: "light" }), set } },
    });

    dom.window.document.getElementById("themeToggle").click();

    expect(set).toHaveBeenCalledWith({ theme: "dark" });
    expect(dom.window.document.documentElement.getAttribute("data-theme")).toBe(
      "dark",
    );
  });
});
