#!/usr/bin/env bash
# Render every 'working' indicator style (render.html) and pack each into a looping animated WebP in
# mods/crew-roster/working/<id>.webp, plus styles.json (id, group, name, frames, loop length).
# Needs chromium and ImageMagick 7 (magick) with WebP. Run from anywhere: ./tools/working-indicators/build.sh
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
repo=$(cd "$here/../.." && pwd)
out="$repo/mods/crew-roster/working"
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
chromium --headless=new --disable-gpu --no-sandbox --hide-scrollbars --virtual-time-budget=60000 \
  --dump-dom "file://$here/render.html#build" 2>/dev/null > "$tmp/dom.html"
mkdir -p "$out"
python3 -I - "$tmp" "$out" <<'PY'
import base64, html, json, os, re, subprocess, sys
tmp, out = sys.argv[1], sys.argv[2]
dom = open(f"{tmp}/dom.html", encoding="utf-8").read()
m = re.search(r'<pre id="out">(.*?)</pre>', dom, re.S)
if not m or not m.group(1).strip(): sys.exit("render.html produced no frames")
styles = json.loads(html.unescape(m.group(1)))
index = []
for sid, st in styles.items():
    d = f"{tmp}/{sid}"; os.makedirs(d)
    for i, url in enumerate(st["frames"]):
        with open(f"{d}/{i:03d}.png", "wb") as f: f.write(base64.b64decode(url.split(",", 1)[1]))
    frames = sorted(os.listdir(d))
    # Each frame replaces the last (no blending), lossless, forever.
    subprocess.run(["magick", "-delay", f"{st['delay']}x1000", "-dispose", "Background", "-loop", "0",
                    *[f"{d}/{x}" for x in frames], "-define", "webp:lossless=true", "-define", "webp:method=6",
                    f"{out}/{sid}.webp"], check=True)
    index.append({"id": sid, "group": st["group"], "name": st["name"], "frames": len(frames),
                  "ms": st["delay"] * len(frames), "px": st["size"]})
    print(f"{sid:16} {len(frames):3} frames x {st['delay']:3} ms  {os.path.getsize(f'{out}/{sid}.webp'):6} bytes")
with open(f"{out}/styles.json", "w") as f: json.dump(index, f, indent=1); f.write("\n")
PY
