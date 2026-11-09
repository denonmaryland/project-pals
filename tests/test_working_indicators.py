"""The working-indicator styles: crew.js's list, the built art and styles.json agree, and every file
is a looping animated WebP with alpha (Herdr plays it natively; a still or a one-shot would look dead).
Run: python3 -m unittest tests.test_working_indicators"""

import json
import re
import shutil
import struct
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ART = ROOT / "mods" / "crew-roster" / "working"


def webp_anim(path):
    """(loop count, [frame durations ms], has alpha) of an animated WebP; loop None when it isn't one."""
    b = path.read_bytes()
    assert b[:4] == b"RIFF" and b[8:12] == b"WEBP", f"{path.name} is not a WebP"
    i, loop, alpha, durs = 12, None, False, []
    while i + 8 <= len(b):
        tag, n = b[i:i + 4], struct.unpack("<I", b[i + 4:i + 8])[0]
        d = b[i + 8:i + 8 + n]
        if tag == b"VP8X":
            alpha = bool(d[0] & 0x10)
        elif tag == b"ANIM":
            loop = struct.unpack("<H", d[4:6])[0]
        elif tag == b"ANMF":
            durs.append(int.from_bytes(d[12:15], "little"))
        i += 8 + n + (n & 1)
    return loop, durs, alpha


def crew_styles():
    src = (ROOT / "lib" / "crew.js").read_text()
    block = src.split("export const WORKING_STYLES = [", 1)[1].split("].map(", 1)[0]
    return re.findall(r'\["([a-z0-9-]+)", "([a-z]+)", "([^"]+)"\]', block)


class WorkingIndicators(unittest.TestCase):
    def test_list_matches_built_art(self):
        styles = crew_styles()
        self.assertEqual(styles[0], ("classic", "classic", "Classic dot"), "Classic dot is the first (the default)")
        built = json.loads((ART / "styles.json").read_text())
        self.assertEqual([(s["id"], s["group"], s["name"]) for s in built], [s for s in styles if s[0] != "classic"])
        groups = {}
        for _, g, _ in styles[1:]:
            groups[g] = groups.get(g, 0) + 1
        self.assertEqual(groups, {"pixel": 10, "sphere": 10, "ascii": 10})
        on_disk = sorted(p.stem for p in ART.glob("*.webp"))
        self.assertEqual(on_disk, sorted(s[0] for s in styles[1:]), "one file per style, no leftovers")

    def test_every_file_loops_forever(self):
        for meta in json.loads((ART / "styles.json").read_text()):
            loop, durs, alpha = webp_anim(ART / f"{meta['id']}.webp")
            with self.subTest(style=meta["id"]):
                self.assertEqual(loop, 0, "loops forever")
                self.assertGreater(len(durs), 1, "animated")
                self.assertTrue(alpha, "transparent background")
                self.assertEqual(sum(durs), meta["ms"], "the loop is as long as it was drawn")
                self.assertGreaterEqual(min(durs), 33, "no faster than Herdr's ~30 fps")

    @unittest.skipUnless(shutil.which("magick"), "needs ImageMagick")
    def test_ascii_globes_read_at_row_size(self):
        # At the 16 px row size the board's colours were 1-10 % opaque (DeNon: too faint); the
        # renderer's contrast stretch and thicker glyphs took the set to ~34 %. Keep it there.
        cover = {}
        for f in sorted(ART.glob("ascii-*.webp")):
            out = subprocess.run(["magick", f"{f}[0]", "-resize", "16x16", "-channel", "A", "-separate",
                                  "-format", "%[fx:mean*100]", "info:"], capture_output=True, text=True, check=True)
            cover[f.stem] = float(out.stdout)
        self.assertEqual(len(cover), 10)
        for sid, c in cover.items():
            with self.subTest(style=sid):
                self.assertGreater(c, 5, "visible at row size")
        self.assertGreater(sum(cover.values()) / len(cover), 25, "the set reads at row size")

    def test_unknown_setting_falls_back_to_classic(self):
        src = (ROOT / "lib" / "crew.js").read_text()
        self.assertIn("WORKING_STYLES.find((x) => x.id === id) ?? WORKING_STYLES[0]", src)


if __name__ == "__main__":
    unittest.main()
