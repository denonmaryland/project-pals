"""A pal's freeform pages: plain Markdown files in its memory folder (crew-memory/<pal>/pages/*.md).
`pal page` reads and writes them; a pal writes its own, and with Full control a trusted helper
writes any pal's (`--pal`). They used to show in the pal's Computer's Notes; Pals Lite (T217)
deleted the Computer, and these helpers moved here from bin/crewcomputer.py."""
import re

from crewlib import memory_dir

PAGE_NAME = re.compile(r"^[^/\\\x00]{1,80}\.md$")


def pages_dir(name):
    return memory_dir(name) / "pages"


def pages(name):
    d = pages_dir(name)
    if not d.exists():
        return []
    return [{"name": p.stem, "file": str(p), "updated": int(p.stat().st_mtime * 1000)}
            for p in sorted(d.glob("*.md"), key=lambda p: -p.stat().st_mtime)]


def page_path(name, title):
    """Where a page called `title` lives; refuses names that would leave the pages folder."""
    from crewlib import CrewError
    base = " ".join(str(title).split())
    fname = base + ".md"
    if not base or base.startswith(".") or base.endswith(".") or not PAGE_NAME.match(fname):
        raise CrewError(f"a page name is plain text up to 80 characters, without / or a leading dot: '{title}'")
    return pages_dir(name) / fname
