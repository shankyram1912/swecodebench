#!/usr/bin/env python3
"""
build.py — turns the Claude-artifact .jsx components into standalone browser pages.

For each component it:
  1. strips the top-level `import ... from "react"` line (hooks are injected globally)
  2. rewrites `export default function App` -> `function App`
  3. wraps it in an HTML shell that loads React + Babel + Tailwind from CDN
  4. injects a localStorage-backed shim for window.storage so progress persists

Output: ./static/<module>.html  (one self-contained file each)
"""
import re
import pathlib

ROOT = pathlib.Path(__file__).parent
SRC = ROOT / "components"
OUT = ROOT / "static"
OUT.mkdir(exist_ok=True)

# module slug -> (source file, page title, accent hex)
MODULES = {
    "trace":  ("dsa_trainer.jsx", "Trace Terminal — Visualize DS&A", "#E8A33D"),
    "bench":  ("python_bench.jsx", "Python Bench — Practice Editor",  "#4FC1B6"),
    "dex":    ("method_dex.jsx",   "Method Dex — Method Mastery",     "#9D8CFF"),
}

# window.storage shim: same async API the components expect, backed by localStorage.
STORAGE_SHIM = r"""
    // ---- window.storage shim (localStorage-backed, matches the artifact API) ----
    (function () {
      const KEY_PREFIX = "swecodebench::";
      window.storage = {
        async get(key) {
          const v = localStorage.getItem(KEY_PREFIX + key);
          return v === null ? null : { key, value: v };
        },
        async set(key, value) {
          localStorage.setItem(KEY_PREFIX + key, value);
          return { key, value };
        },
        async delete(key) {
          localStorage.removeItem(KEY_PREFIX + key);
          return { key, deleted: true };
        },
        async list(prefix = "") {
          const keys = [];
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith(KEY_PREFIX)) {
              const bare = k.slice(KEY_PREFIX.length);
              if (bare.startsWith(prefix)) keys.push(bare);
            }
          }
          return { keys, prefix };
        },
      };
    })();
"""

HTML = """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>{title}</title>
  <meta name="theme-color" content="{accent}" />
  <script src="https://unpkg.com/react@18/umd/react.production.min.js" crossorigin></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js" crossorigin></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js" crossorigin></script>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    html, body, #root {{ height: 100%; margin: 0; background: #0B0E14; }}
    #boot {{ color: #8B93A7; font-family: ui-monospace, Menlo, monospace; padding: 24px; font-size: 13px; }}
  </style>
</head>
<body>
  <div id="root"><div id="boot">loading {title}…</div></div>
  <script type="text/babel" data-presets="react">
    const {{ useState, useEffect, useRef, useCallback, useMemo, useLayoutEffect, useContext, createContext, Fragment }} = React;
{shim}
    // ============================ component source ============================
{body}
    // =========================================================================
    ReactDOM.createRoot(document.getElementById("root")).render(<App />);
  </script>
</body>
</html>
"""

def convert(jsx: str) -> str:
    # 1. drop the top react import (any single-line form)
    jsx = re.sub(r'^\s*import\s+\{[^}]*\}\s+from\s+["\']react["\'];?\s*$', '', jsx, count=1, flags=re.M)
    # 2. export default function App  ->  function App
    jsx = re.sub(r'export\s+default\s+function\s+App', 'function App', jsx, count=1)
    # 2b. fallback: `export default App;` style
    jsx = re.sub(r'^\s*export\s+default\s+App\s*;?\s*$', '', jsx, flags=re.M)
    return jsx.strip()

def main():
    for slug, (fname, title, accent) in MODULES.items():
        src = (SRC / fname).read_text(encoding="utf-8")
        body = convert(src)
        page = HTML.format(title=title, accent=accent, shim=STORAGE_SHIM, body=body)
        (OUT / f"{slug}.html").write_text(page, encoding="utf-8")
        print(f"  built static/{slug}.html  ({len(page)//1024} KB)  from {fname}")
    print("done.")

if __name__ == "__main__":
    main()
