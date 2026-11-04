#!/usr/bin/env python3
"""Draws the README's screens with the real mod and made-up data, in a separate Herdr window.

Usage: capture.py <short home path> <en|ko> <output folder>
The home path becomes a socket path, so it must be short (such as /tmp/prdemo).
"""
import json, os, re, shutil, subprocess, sys, time
from pathlib import Path
from PIL import Image

home, lang, out = Path(sys.argv[1]), sys.argv[2], Path(sys.argv[3])
root = Path(__file__).resolve().parents[2]
env = {**os.environ, "HERDR_APP_HOME": str(home)}
APP = "/Applications/Herdr.app/Contents/MacOS/Herdr"
PANEL, W, H = 340, 1120, 760

def app(*args):
    return subprocess.run(["herdr-app", *args], env=env, capture_output=True, text=True)

def scene(n):
    (home / "demo-step.txt").write_text(str(n))

def build():
    shutil.rmtree(home, ignore_errors=True)
    (home / "mods" / "demo-agent").mkdir(parents=True)
    (home / "layouts").mkdir()
    mod = home / "mods" / "pr-flow"
    shutil.copytree(root / "mods" / "pr-flow", mod, ignore=shutil.ignore_patterns("*.d.ts", "jsconfig.json"))
    shutil.copy(root / "scripts" / "demo" / "fake.js", mod / "fake.js")
    shutil.copy(root / "scripts" / "demo" / "agent.js", home / "mods" / "demo-agent" / "main.js")
    (home / "mods" / "demo-agent" / "mod.json").write_text('{ "place": "none" }')
    (mod / "mod.json").write_text('{ "place": "none" }')
    main = (mod / "main.js").read_text()
    main, n = re.subn(r'import \{ agents, panes, spaces, focused, exec, run, ', 'import { agents, panes, spaces, exec, run } from "./fake.js";\nimport { focused, ', main)
    assert n == 1
    (mod / "main.js").write_text(main)
    block = lambda i, mod, props=None, size=None: {"id": i, "type": "block", **({"size": {"px": size}} if size else {}), "content": {"mod": mod, **({"props": props} if props else {})}}
    base = {"id": "root", "type": "row", "titlebar": "none", "background": "canvas", "padding": 8, "gap": 8}
    (home / "layouts" / "demo.json").write_text(json.dumps({**base, "children": [block("agent", "demo-agent"), block("panel", "pr-flow", size=PANEL)]}))
    (home / "layouts" / "demo-view.json").write_text(json.dumps({**base, "children": [block("view", "pr-flow", {"screen": "viewer"}), block("panel", "pr-flow", size=PANEL)]}))
    (home / "settings.json").write_text(json.dumps({"zoom": 1, "sounds": {"enabled": False}, "appearance": "dark"}))
    (home / "shared.json").write_text(json.dumps({"frame.welcomed": "finished", "layout": "demo"}))
    version = app("--version").stdout.split()[-1]
    (home / "update-notes.json").write_text(json.dumps({"last_run": version, "presented": []}))
    (home / "window.json").write_text(json.dumps({"state": "windowed", "bounds": [80, 60, W, H]}))
    scene(0)

def wait_window():
    window = subprocess.Popen([APP], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(30):
        time.sleep(0.5)
        if app("status").returncode == 0:
            # Notifications about the person's other Herdr window don't belong in the pictures.
            (home / "mods" / "toast" / "main.js").write_text(
                'import { View, div } from "gpui-kit";\nexport default class Toast extends View { render() { return div(); } }\n')
            return window
    sys.exit("no window")

frames = []
def clear_overlays():
    # A fresh home opens with the app's own welcome and what's-new windows.
    for _ in range(5):
        overlays = json.loads(app("status").stdout).get("overlays") or []
        if not overlays:
            return
        app("do", "overlay.close")
        time.sleep(0.4)

def shot(name, hold=1.4, keep=None):
    clear_overlays()
    time.sleep(0.3)
    path = out / "frames" / f"{len(frames):02d}-{name}.png"
    app("shot", str(path))
    frames.append((path, hold))
    if keep:
        Image.open(path).crop(keep).save(out / f"{name}-{lang}.png")

def go(cmd, wait=1.2):
    app("do", f"pr-flow.{cmd}")
    time.sleep(wait)

def panel_box():
    w, h = Image.open(frames[-1][0]).size
    scale = w / W
    return (int(w - (PANEL + 12) * scale), 0, w, h)

out.mkdir(parents=True, exist_ok=True)
shutil.rmtree(out / "frames", ignore_errors=True)
(out / "frames").mkdir()
build()
window = wait_window()
app("do", "layout.switch", "--name", "demo")
time.sleep(3)
app("do", f"pr-flow.lang-{lang}")
time.sleep(6)  # discovery runs on the first ticks
go("refresh", 3)
shot("start", 2.6)
box = panel_box()
Image.open(frames[-1][0]).save(out / f"preview-{lang}.png")
scene(1); go("refresh", 2); shot("list", 2.2, keep=box)
scene(2); go("refresh", 2); shot("merged", 2.2, keep=box)
go("open", 1.6); shot("pr-running", 2.4, keep=box)
scene(3); go("refresh", 2); go("first-run", 2); shot("pr-steps", 2.6, keep=box)
scene(4); go("refresh", 2); shot("pr-done", 2.6)
go("first-issue", 2); shot("issue", 2.6, keep=box); go("issue-back", 0.8)
go("first-file", 1)
app("do", "layout.switch", "--name", "demo-view")
time.sleep(4)
shot("diff", 3)
Image.open(frames[-1][0]).save(out / f"diff-{lang}.png")
app("do", "layout.switch", "--name", "demo")
time.sleep(4)
go("settings", 1.2); shot("settings", 1.6, keep=box); go("settings", 0.6)
(out / f"frames-{lang}.txt").write_text("".join(f"file '{p}'\nduration {d}\n" for p, d in frames) + f"file '{frames[-1][0]}'\n")
window.terminate()
try:
    window.wait(10)
except subprocess.TimeoutExpired:
    window.kill()
