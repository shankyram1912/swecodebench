#!/usr/bin/env python3
"""
SWE Code Bench — FastAPI server, fully namespaced under /swecodebench.

Designed to be hosted under an existing domain: EVERY route lives beneath the
/swecodebench prefix, so nothing collides with the rest of the site.

Routes (all under the prefix)
  GET /swecodebench/                 -> landing page linking all modules
  GET /swecodebench/healthz          -> liveness probe ("ok")
  GET /swecodebench/{module}         -> the module (trace | bench | dex)

There are intentionally NO root-level ("/") routes.

Run standalone:
  pip install -r requirements.txt
  uvicorn server:app --host 0.0.0.0 --port 8000
  # http://localhost:8000/swecodebench/

Mounting behind a reverse proxy: forward the /swecodebench/ path through as-is
(do NOT strip the prefix — the app expects it). Example nginx:
  location /swecodebench/ { proxy_pass http://127.0.0.1:8000; }
"""
import pathlib
from fastapi import FastAPI, APIRouter, HTTPException
from fastapi.responses import HTMLResponse, PlainTextResponse

ROOT = pathlib.Path(__file__).parent
STATIC = ROOT / "static"
PREFIX = "/swecodebench"

app = FastAPI(title="SWE Code Bench", docs_url=None, redoc_url=None)
router = APIRouter(prefix=PREFIX)

# slug -> (filename, display name, one-line description, accent)
MODULES = {
    "trace": ("trace.html", "Trace Terminal", "Step through 11 algorithms as execution tapes — narrate the invariant.", "#E8A33D"),
    "bench": ("bench.html", "Python Bench", "Real-CPython practice editor, cost-coded cards, executed tasks, rapid fire.", "#4FC1B6"),
    "dex":   ("dex.html",   "Method Dex",   "Every built-in method — signature, return, mutation, time & space, drilled.", "#9D8CFF"),
}

LANDING = """<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>SWE Code Bench</title>
<script src="https://cdn.tailwindcss.com"></script>
<style>body{{background:#0B0E14}}</style>
</head>
<body class="min-h-screen text-stone-200" style="font-family:-apple-system,Segoe UI,Roboto,sans-serif">
  <div class="max-w-2xl mx-auto px-6 py-12">
    <div class="text-xs tracking-[0.2em] mb-2" style="color:#E8A33D;font-family:ui-monospace,monospace">SWE CODE BENCH</div>
    <h1 class="text-2xl font-bold mb-1">From zero to the coding loop.</h1>
    <p class="text-sm mb-8" style="color:#8B93A7">Three tools. Drill the alphabet, learn the sentences, then sit the exam in a bare editor.</p>
    <div class="flex flex-col gap-3">
      {cards}
    </div>
    <p class="text-xs mt-10 leading-relaxed" style="color:#8B93A7">
      Progress persists per browser via localStorage. The interpreter-backed pages (Bench, Dex examples)
      load CPython via WebAssembly on first use — give them a few seconds. None of this replaces blank-page
      reps with a timer; it removes the friction around them.
    </p>
  </div>
</body></html>"""

# Links are prefix-relative so the whole thing relocates cleanly under the domain.
CARD = """<a href="{prefix}/{slug}" class="block rounded-lg p-5 transition"
   style="background:#11161F;border:1px solid #232B3B">
  <div class="flex items-center gap-2 mb-1">
    <span class="text-base font-bold" style="color:{accent};font-family:ui-monospace,monospace">{name}</span>
    <span class="ml-auto text-xs" style="color:#8B93A7;font-family:ui-monospace,monospace">{prefix}/{slug} &rarr;</span>
  </div>
  <div class="text-sm" style="color:#8B93A7">{desc}</div>
</a>"""


@router.get("/healthz", response_class=PlainTextResponse)
def healthz():
    return "ok"


@router.get("/", response_class=HTMLResponse)
@router.get("", response_class=HTMLResponse)
def landing():
    cards = "\n".join(
        CARD.format(prefix=PREFIX, slug=slug, name=name, desc=desc, accent=accent)
        for slug, (_f, name, desc, accent) in MODULES.items()
    )
    return HTMLResponse(LANDING.format(cards=cards))


@router.get("/{module}", response_class=HTMLResponse)
def module(module: str):
    entry = MODULES.get(module)
    if not entry:
        raise HTTPException(404, f"unknown module '{module}'. Try: {', '.join(MODULES)}")
    path = STATIC / entry[0]
    if not path.exists():
        raise HTTPException(500, f"{entry[0]} missing — run `python build.py` first.")
    return HTMLResponse(path.read_text(encoding="utf-8"))


app.include_router(router)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8005, reload=True)
