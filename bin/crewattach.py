#!/usr/bin/env python3
"""Task attachments, copied into data/crew-attachments safely (Codex review M4, M5).

  crewattach.py copy SRC DIR    a dropped / picked image
  crewattach.py paste DIR       the clipboard's image (Wayland's wl-paste)

Prints {"path": ...} or {"error": ..., "code": N} and exits with N:
3 nothing to paste · 4 over the size limit · 5 not an image · 6 not a regular file (a symlink,
a folder, a device) · 1 anything else.

- The source is opened with O_NOFOLLOW and checked with fstat on that same handle, then read from
  it (at most MAX_BYTES + 1 bytes): no stat-then-copy race, and a symlink is refused, not followed.
- The bytes must start like a PNG, JPEG, GIF, WebP or BMP image; the extension isn't trusted.
- Each attachment gets a fresh name (time, a random part, the cleaned original name) created with
  O_EXCL: nothing existing is ever overwritten, and a failure never removes an existing file."""
import json
import os
import re
import secrets
import stat
import subprocess
import sys
import time

MAX_BYTES = 10 * 1024 * 1024
EXT = {"png": ".png", "jpg": ".jpg", "gif": ".gif", "webp": ".webp", "bmp": ".bmp"}


class Refused(Exception):
    def __init__(self, msg, code):
        super().__init__(msg)
        self.code = code


def kind(head):
    if head.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if head.startswith(b"\xff\xd8\xff"):
        return "jpg"
    if head[:6] in (b"GIF87a", b"GIF89a"):
        return "gif"
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "webp"
    if head[:2] == b"BM" and len(head) >= 14:
        return "bmp"
    return None


def read_limited(stream_read, limit=MAX_BYTES):
    chunks, n = [], 0
    while n <= limit:
        b = stream_read(min(1 << 20, limit + 1 - n))
        if not b:
            break
        chunks.append(b)
        n += len(b)
    data = b"".join(chunks)
    if len(data) > limit:
        raise Refused(f"over {limit // (1024 * 1024)} MB", 4)
    return data


def publish(data, dest_dir, name):
    k = kind(data[:16])
    if not k:
        raise Refused("not an image (png, jpg, gif, webp or bmp)", 5)
    os.makedirs(dest_dir, exist_ok=True)
    stem = re.sub(r"[^\w.-]+", "_", os.path.splitext(os.path.basename(name))[0])[:60] or "image"
    for _ in range(20):
        fname = f"{time.strftime('%Y%m%d%H%M%S')}-{secrets.token_hex(4)}-{stem}{EXT[k]}"
        path = os.path.join(dest_dir, fname)
        try:
            fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o644)
        except FileExistsError:
            continue
        try:
            with os.fdopen(fd, "wb") as f:
                f.write(data)
        except BaseException:
            os.unlink(path)   # only the file this call just created
            raise
        return path
    raise Refused("couldn't find a free name", 1)


def copy(src, dest_dir):
    try:
        fd = os.open(src, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    except OSError as e:
        if e.errno == 40:   # ELOOP: a symlink
            raise Refused("a symlink: attach the file itself", 6)
        raise Refused(f"can't open it: {e.strerror}", 1)
    with os.fdopen(fd, "rb") as f:
        st = os.fstat(f.fileno())
        if not stat.S_ISREG(st.st_mode):
            raise Refused("not a regular file", 6)
        if st.st_size > MAX_BYTES:
            raise Refused(f"over {MAX_BYTES // (1024 * 1024)} MB", 4)
        data = read_limited(f.read)
    return publish(data, dest_dir, src)


def paste(dest_dir):
    try:
        types = subprocess.run(["wl-paste", "--list-types"], capture_output=True, text=True, timeout=5).stdout.split()
    except (OSError, subprocess.TimeoutExpired):
        types = []
    t = next((x for x in types if x.startswith("image/")), None)
    if not t:
        raise Refused("the clipboard has no image", 3)
    p = subprocess.Popen(["wl-paste", "--no-newline", "--type", t], stdout=subprocess.PIPE)
    try:
        data = read_limited(p.stdout.read)
    finally:
        p.kill()
        p.wait()
    return publish(data, dest_dir, "pasted")


def main(argv):
    try:
        if len(argv) == 3 and argv[0] == "copy":
            path = copy(argv[1], argv[2])
        elif len(argv) == 2 and argv[0] == "paste":
            path = paste(argv[1])
        else:
            print(__doc__)
            return 2
    except Refused as e:
        print(json.dumps({"error": str(e), "code": e.code}))
        return e.code
    print(json.dumps({"path": path}))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
