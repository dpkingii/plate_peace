import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

// content.js / popup/scripts.js are plain classic scripts (no imports/exports,
// relying on top-level `function` declarations landing on `window`). We load
// them into a jsdom window via eval — the same way a <script src> tag would —
// instead of importing them, so production code doesn't need to change shape
// just to be testable.
function readSource(relativePath) {
  const path = fileURLToPath(new URL(`../../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

// Creates a jsdom window with `html` as the body, a mock `chrome` global
// (merged over sane no-op defaults), then evaluates `scriptPath` in it.
export function loadPage(scriptPath, { html = "", chrome = {}, setup } = {}) {
  const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, {
    url: "https://example.com/",
    runScripts: "outside-only",
  });

  dom.window.chrome = mergeChromeMock(chrome);
  // jsdom doesn't implement matchMedia; default to "no preference" unless a
  // test overrides it via `setup` to simulate a specific OS theme.
  dom.window.matchMedia ??= () => ({ matches: false });
  setup?.(dom.window);
  dom.window.eval(readSource(scriptPath));

  return dom;
}

function mergeChromeMock(overrides) {
  return {
    storage: {
      sync: {
        get: (_keys, cb) => cb({}),
        set: () => {},
        ...overrides.storage?.sync,
      },
    },
    runtime: {
      onMessage: { addListener: () => {} },
      lastError: null,
      ...overrides.runtime,
    },
    tabs: {
      query: (_opts, cb) => cb([{ id: 1 }]),
      sendMessage: (_id, _msg, cb) => cb?.(),
      reload: () => {},
      ...overrides.tabs,
    },
  };
}
