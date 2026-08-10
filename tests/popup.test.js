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

describe("report link", () => {
  it("opens a new tab to the report form pre-filled with the active tab's URL", () => {
    const create = vi.fn();
    const dom = loadPopup({
      tabs: {
        query: (_opts, cb) => cb([{ id: 1, url: "https://example.com/menu" }]),
        create,
      },
    });

    dom.window.document.getElementById("reportLink").click();

    expect(create).toHaveBeenCalledOnce();
    const openedUrl = new dom.window.URL(create.mock.calls[0][0].url);
    expect(openedUrl.origin + openedUrl.pathname).toBe(
      "https://docs.google.com/forms/d/e/REPLACE_WITH_FORM_ID/viewform",
    );
    expect(openedUrl.searchParams.get("entry.REPLACE_WITH_ENTRY_ID")).toBe(
      "https://example.com/menu",
    );
  });

  it("locks itself after one report and remembers it for that site for the rest of the session", () => {
    const create = vi.fn();
    const sessionSet = vi.fn();
    const dom = loadPopup({
      tabs: { query: (_opts, cb) => cb([{ id: 1, url: "https://example.com/menu" }]), create },
      storage: { session: { set: sessionSet } },
    });

    const reportLink = dom.window.document.getElementById("reportLink");
    reportLink.click();

    expect(reportLink.classList.contains("reported")).toBe(true);
    expect(reportLink.classList.contains("disabled")).toBe(true);
    expect(sessionSet).toHaveBeenCalledWith({ reportedHostnames: ["example.com"] });

    // A second click shouldn't fire another report — it's locked for this site.
    reportLink.click();
    expect(create).toHaveBeenCalledOnce();
  });

  it("shows as already-reported and locked on open if storage.session has this site", () => {
    const dom = loadPopup({
      tabs: { query: (_opts, cb) => cb([{ id: 1, url: "https://example.com/menu" }]) },
      storage: {
        session: { get: (_keys, cb) => cb({ reportedHostnames: ["example.com"] }) },
      },
    });

    const reportLink = dom.window.document.getElementById("reportLink");
    expect(reportLink.classList.contains("reported")).toBe(true);
    expect(reportLink.classList.contains("disabled")).toBe(true);
  });

  it("is still reportable on a different site even if another site was already reported this session", () => {
    const create = vi.fn();
    const dom = loadPopup({
      tabs: { query: (_opts, cb) => cb([{ id: 1, url: "https://newsite.com/menu" }]), create },
      storage: {
        session: { get: (_keys, cb) => cb({ reportedHostnames: ["example.com"] }) },
      },
    });

    const reportLink = dom.window.document.getElementById("reportLink");
    expect(reportLink.classList.contains("disabled")).toBe(false);

    reportLink.click();
    expect(create).toHaveBeenCalledOnce();
  });

  it("disables itself once the daily report cap is hit", () => {
    const create = vi.fn();
    const now = Date.now();
    const dom = loadPopup({
      tabs: { query: (_opts, cb) => cb([{ id: 1, url: "https://example.com/menu" }]), create },
      storage: {
        local: { get: (_keys, cb) => cb({ reportTimestamps: Array(5).fill(now) }) },
      },
    });

    const reportLink = dom.window.document.getElementById("reportLink");
    expect(reportLink.classList.contains("disabled")).toBe(true);

    reportLink.click();
    expect(create).not.toHaveBeenCalled();
  });

  it("ignores expired report timestamps when counting toward the cap", () => {
    const dayAgo = Date.now() - 25 * 60 * 60 * 1000;
    const dom = loadPopup({
      storage: {
        local: { get: (_keys, cb) => cb({ reportTimestamps: Array(5).fill(dayAgo) }) },
      },
    });

    expect(
      dom.window.document.getElementById("reportLink").classList.contains("disabled"),
    ).toBe(false);
  });
});
