#!/usr/bin/env python3
"""Generate the Crew mascot SVGs: a body color per bot, an accessory per harness, a file per mood.

Moods follow Herdr agent status: calm (idle), working, blocked (needs you), done, asleep
(no live terminal). Output: mods/crew-roster/mascots/<color>-<accessory>-<mood>.svg
"""
from pathlib import Path

OUT = Path(__file__).resolve().parent / "mods" / "crew-roster" / "mascots"

# Body colors: one per bot (hired bots default to their harness's color; spaces get one by name).
COLORS = {
    "clay": dict(body="#e0866a", ink="#2a120a", blush="#ff5a6e"),
    "cream": dict(body="#e6e8ef", ink="#15161c", blush="#ff7a8a"),
    "ink": dict(body="#1b1e2b", ink="#ffffff", blush="#ff7a8a", stroke="rgba(255,255,255,0.24)"),
    "blue": dict(body="#6f9cf0", ink="#0b1733", blush="#ff7aa8"),
    "violet": dict(body="#a28cf0", ink="#1a1238", blush="#ff7aa8"),
    "amber": dict(body="#f0b245", ink="#2a1a00", blush="#ff6a5a"),
    "mint": dict(body="#6fd6a8", ink="#0b2a1c", blush="#ff7a8a"),
    "pink": dict(body="#f08cc0", ink="#3a0f26", blush="#ff5a7e"),
    "slate": dict(body="#8f96b3", ink="#141726", blush="#ff7a8a"),
    # The god bot's.
    "pearl": dict(body="#f7f2e6", ink="#1e170a", blush="#ff8a7a", stroke="rgba(201,162,74,0.55)"),
}

# Accessories: one per harness, drawn behind ("back") or over ("front") the body.
ACCESSORIES = {
    "claude": dict(front='<g transform="rotate(32 28 12)"><rect x="22.5" y="10" width="11" height="4.4" rx="2.2" fill="#ffe8d2"/>'
                         '<rect x="26.6" y="10" width="2.8" height="4.4" fill="#f4caa2"/></g>'),
    "codex": dict(front='<circle cx="25.5" cy="23" r="4.9" fill="none" stroke="#c9a24a" stroke-width="1.3"/>'
                        '<path d="M30.2 24.6 Q32.6 30 30.6 35" stroke="#c9a24a" stroke-width="0.9" fill="none" stroke-linecap="round"/>'),
    "grok": dict(back='<path d="M20 9 L20 4.5" stroke="#4a5070" stroke-width="1.5" stroke-linecap="round"/>'
                      '<circle cx="20" cy="3.7" r="3.6" fill="#8eb0e6" opacity="0.25"/><circle cx="20" cy="3.7" r="2.4" fill="#8eb0e6"/>'),
    "gemini": dict(ears=True),
    "hermes": dict(back='<ellipse cx="20" cy="5.8" rx="8.5" ry="2.3" fill="none" stroke="#f4e7a1" stroke-width="1.4"/>'),
    "opencode": dict(back='<path d="M20 9 C20.2 6 21.6 4 25 3.4 C24.8 6.6 22.8 8.4 20 9Z" fill="#7fd99a"/>'
                          '<path d="M20 9 C19.4 6.6 17.8 5.4 15.4 5.4 C16 7.6 17.6 8.8 20 9Z" fill="#5fc27f"/>'),
    "other": dict(back='<path d="M14 9.6 Q20 5 26 9.6" stroke="#c3c8dc" stroke-width="1.4" fill="none" stroke-linecap="round"/>'),
    # The god bot: a little gold crown, whatever its harness.
    "crown": dict(back='<circle cx="20" cy="7" r="6.6" fill="#ffd66b" opacity="0.22"/>',
                  front='<path d="M13.2 10.6 L12.6 4.4 L16.6 7.6 L20 2.6 L23.4 7.6 L27.4 4.4 L26.8 10.6 Z" fill="#f2c14e" stroke="#c9952a" stroke-width="0.7" stroke-linejoin="round"/>'
                        '<rect x="13.2" y="9.4" width="13.6" height="1.9" rx="0.95" fill="#e0ac38"/>'
                        '<circle cx="20" cy="2.7" r="1.1" fill="#fff4cc"/><circle cx="12.6" cy="4.4" r="0.9" fill="#fff4cc"/><circle cx="27.4" cy="4.4" r="0.9" fill="#fff4cc"/>'
                        '<circle cx="20" cy="7.6" r="1.15" fill="#e8607a"/>'),
    "none": dict(),
}


def ears(body):
    return (f'<ellipse cx="8.6" cy="11.5" rx="4.2" ry="4.6" fill="{body}"/><ellipse cx="8.8" cy="11.8" rx="2.3" ry="2.6" fill="#ffffff" opacity="0.4"/>'
            f'<ellipse cx="31.4" cy="11.5" rx="4.2" ry="4.6" fill="{body}"/><ellipse cx="31.2" cy="11.8" rx="2.3" ry="2.6" fill="#ffffff" opacity="0.4"/>')


def face(mood, ink, blush):
    """The face as (eyes, rest): eyes are their own layer so living mascots can look around."""
    hl = "#ffffff" if ink != "#ffffff" else "#1b1e2b"
    cheeks = (f'<ellipse cx="10.5" cy="28" rx="2.6" ry="1.4" fill="{blush}" opacity="0.42"/>'
              f'<ellipse cx="29.5" cy="28" rx="2.6" ry="1.4" fill="{blush}" opacity="0.42"/>')
    if mood == "calm":
        return (f'<ellipse cx="14.5" cy="23" rx="2.2" ry="2.8" fill="{ink}"/><ellipse cx="25.5" cy="23" rx="2.2" ry="2.8" fill="{ink}"/>'
                f'<circle cx="15.2" cy="22" r="0.8" fill="{hl}"/><circle cx="26.2" cy="22" r="0.8" fill="{hl}"/>',
                cheeks + f'<path d="M18.2 28.2 Q20 29.9 21.8 28.2" stroke="{ink}" stroke-width="1.3" fill="none" stroke-linecap="round"/>')
    if mood == "working":
        return (f'<ellipse cx="15.2" cy="23.2" rx="2.2" ry="2.6" fill="{ink}"/><ellipse cx="26.2" cy="23.2" rx="2.2" ry="2.6" fill="{ink}"/>'
                f'<circle cx="15.9" cy="22.3" r="0.8" fill="{hl}"/><circle cx="26.9" cy="22.3" r="0.8" fill="{hl}"/>',
                cheeks +
                f'<path d="M12.6 19.4 L16.8 19.9" stroke="{ink}" stroke-width="1.2" stroke-linecap="round"/>'
                f'<path d="M23.6 19.9 L27.8 19.4" stroke="{ink}" stroke-width="1.2" stroke-linecap="round"/>'
                f'<ellipse cx="20" cy="28.7" rx="1.5" ry="1.1" fill="{ink}"/>'
                '<path d="M33.6 13 C35 14.6 35 16 33.6 16.8 C32.2 16 32.2 14.6 33.6 13Z" fill="#9bd6ff"/>')
    if mood == "blocked":
        return (f'<ellipse cx="14.5" cy="23" rx="2.4" ry="3.1" fill="{ink}"/><ellipse cx="25.5" cy="23" rx="2.4" ry="3.1" fill="{ink}"/>'
                f'<circle cx="15.3" cy="21.8" r="0.9" fill="{hl}"/><circle cx="26.3" cy="21.8" r="0.9" fill="{hl}"/>',
                f'<path d="M12 18.5 L16.6 17.2" stroke="{ink}" stroke-width="1.3" stroke-linecap="round"/>'
                f'<path d="M23.4 17.2 L28 18.5" stroke="{ink}" stroke-width="1.3" stroke-linecap="round"/>'
                f'<ellipse cx="20" cy="29" rx="1.4" ry="1.6" fill="{ink}"/>'
                '<circle cx="34" cy="8" r="4.4" fill="#ff6947"/><path d="M34 5.6 L34 8.6" stroke="#ffffff" stroke-width="1.5" stroke-linecap="round"/>'
                '<circle cx="34" cy="10.5" r="0.85" fill="#ffffff"/>')
    if mood == "done":
        return (f'<path d="M12.3 23.6 Q14.5 20.8 16.7 23.6" stroke="{ink}" stroke-width="1.6" fill="none" stroke-linecap="round"/>'
                f'<path d="M23.3 23.6 Q25.5 20.8 27.7 23.6" stroke="{ink}" stroke-width="1.6" fill="none" stroke-linecap="round"/>',
                f'<ellipse cx="10.5" cy="27.6" rx="2.8" ry="1.6" fill="{blush}" opacity="0.55"/>'
                f'<ellipse cx="29.5" cy="27.6" rx="2.8" ry="1.6" fill="{blush}" opacity="0.55"/>'
                f'<path d="M17.4 27.6 Q20 31 22.6 27.6" stroke="{ink}" stroke-width="1.4" fill="none" stroke-linecap="round"/>'
                '<path d="M33.5 5 L34.4 7.1 L36.5 8 L34.4 8.9 L33.5 11 L32.6 8.9 L30.5 8 L32.6 7.1 Z" fill="#ffe17a"/>')
    if mood == "asleep":
        return (f'<path d="M12.4 23 Q14.5 24.9 16.6 23" stroke="{ink}" stroke-width="1.4" fill="none" stroke-linecap="round"/>'
                f'<path d="M23.4 23 Q25.5 24.9 27.6 23" stroke="{ink}" stroke-width="1.4" fill="none" stroke-linecap="round"/>',
                cheeks + f'<ellipse cx="20" cy="28.8" rx="1.1" ry="0.9" fill="{ink}"/>'
                '<path d="M31 4.5 L34.2 4.5 L31 8.1 L34.2 8.1" stroke="#a9aec8" stroke-width="0.9" fill="none" stroke-linejoin="round" stroke-linecap="round"/>')
    raise ValueError(mood)


MOODS = ("calm", "working", "blocked", "done", "asleep")


def wrap(inner, dim=False):
    g = ' opacity="0.8"' if dim else ""
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 40 40"><g{g}>{inner}</g></svg>\n'


def body(color, acc, mood, with_eyes=True):
    c, x = COLORS[color], ACCESSORIES[acc]
    stroke = f' stroke="{c["stroke"]}" stroke-width="0.8"' if "stroke" in c else ""
    hl = "0.55" if color in ("cream", "pearl") else ("0.14" if color == "ink" else "0.3")
    back = ears(c["body"]) if x.get("ears") else x.get("back", "")
    eyes, rest = face(mood, c["ink"], c["blush"])
    return (back
            + f'<ellipse cx="20" cy="23" rx="16" ry="14.5" fill="{c["body"]}"{stroke}/>'
            + f'<ellipse cx="13.5" cy="15.5" rx="5" ry="2.4" fill="#ffffff" opacity="{hl}" transform="rotate(-22 13.5 15.5)"/>'
            + x.get("front", "") + rest + (eyes if with_eyes else ""))


def main():
    if OUT.exists():
        for old in OUT.glob("*.svg"):
            old.unlink()
    OUT.mkdir(parents=True, exist_ok=True)
    n = 0
    for color, c in COLORS.items():
        for mood in MOODS:
            # The eyes alone, for living mascots (they move over the body).
            eyes, _ = face(mood, c["ink"], c["blush"])
            (OUT / f"{color}-eyes-{mood}.svg").write_text(wrap(eyes, mood == "asleep")); n += 1
            for acc in ACCESSORIES:
                (OUT / f"{color}-{acc}-{mood}.svg").write_text(wrap(body(color, acc, mood), mood == "asleep"))
                (OUT / f"{color}-{acc}-{mood}-body.svg").write_text(wrap(body(color, acc, mood, False), mood == "asleep"))
                n += 2
    print(f"wrote {n} mascots to {OUT}")


if __name__ == "__main__":
    main()
