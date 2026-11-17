"""Owner-configured outbound phone alerts. No inbound actions; no secret readback.

CLI callers must apply their owner gate before configure/enable/disable/privacy/test.
The 0600 store and optional user-bound sealing reduce accidental disclosure; they
are not isolation from code running as the same Linux user. Network work lives in
one crewd thread and one deadline-limited child, never in crewd.tick().
"""
import contextlib
import copy
import fcntl
import datetime
import hmac
import hashlib
import json
import os
from pathlib import Path
import random
import re
import secrets
import shutil
import signal
import ssl
import stat
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

from crewlib import DATA, CrewError

PRIVATE_DIR = Path.home() / ".config/project-pals/notify"
PROTOCOL = "bearer-json-v1"
QUEUE_MAX = 200
SEEN_MAX = 4096
SOURCE_MAX = 8192
FILE_MAX = 2 * 1024 * 1024
STATE_MAX = 4 * 1024 * 1024
TTL = 86400
POST_TIMEOUT = 5
INTERVAL = 2
SCAN_INTERVAL = 10
KINDS = {"ask", "login", "approval", "desk", "proposal", "helper-off", "test"}
OUTCOMES = {"never", "queued", "sent", "retry", "expired", "rejected", "disabled", "configured",
            "credentials-unavailable", "source-unavailable", "state-unavailable", "transport-error",
            "protocol-unconfirmed", "tls-error", "timeout", "redirect-refused", "http-error"}


class NotifyError(CrewError):
    pass


class SourceUnavailable(Exception):
    pass


def _read(path, limit=FILE_MAX, missing=None):
    try:
        if any(parent.is_symlink() for parent in Path(path).parents):
            raise SourceUnavailable()
        fd = os.open(path, os.O_RDONLY | os.O_NONBLOCK | os.O_NOFOLLOW)
        with os.fdopen(fd, "rb") as stream:
            if not stat.S_ISREG(os.fstat(stream.fileno()).st_mode):
                raise SourceUnavailable()
            raw = stream.read(limit + 1)
        if len(raw) > limit:
            raise SourceUnavailable()
        return raw.decode("utf-8")
    except FileNotFoundError:
        return missing
    except (OSError, UnicodeError):
        raise SourceUnavailable() from None


def _tail(path, limit=FILE_MAX):
    """Bounded JSONL tail; older than this retained window is outside recovery."""
    try:
        if any(parent.is_symlink() for parent in Path(path).parents):
            raise SourceUnavailable()
        fd = os.open(path, os.O_RDONLY | os.O_NONBLOCK | os.O_NOFOLLOW)
        with os.fdopen(fd, "rb") as stream:
            info = os.fstat(stream.fileno())
            if not stat.S_ISREG(info.st_mode):
                raise SourceUnavailable()
            start = max(0, info.st_size - limit)
            stream.seek(start)
            raw = stream.read(limit)
        if start:
            raw = raw.partition(b"\n")[2]  # discard a potentially partial first record
        return raw.decode("utf-8", errors="replace")
    except FileNotFoundError:
        return ""
    except OSError:
        raise SourceUnavailable() from None


def _json(path, missing=None, limit=FILE_MAX):
    raw = _read(path, limit, None)
    if raw is None:
        return missing
    try:
        value = json.loads(raw)
    except (ValueError, RecursionError):
        raise SourceUnavailable() from None
    if not isinstance(value, dict):
        raise SourceUnavailable()
    return value


def _directory(directory):
    """No symlink components; create only our directory chain, and restrict our leaf."""
    directory = Path(directory).absolute()
    current = Path(directory.anchor)
    for part in directory.parts[1:]:
        current /= part
        try:
            current.mkdir(mode=0o700)
        except FileExistsError:
            if current.is_symlink() or not current.is_dir():
                raise NotifyError("Phone-alert storage is not a private directory")
    os.chmod(directory, 0o700)
    return directory


def _write(directory, name, value):
    target = directory / name
    if target.is_symlink():
        raise NotifyError("Phone-alert storage contains a link")
    temp = directory / ("." + name + "." + secrets.token_hex(8))
    fd = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        with os.fdopen(fd, "w") as stream:
            json.dump(value, stream, separators=(",", ":"), ensure_ascii=True)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temp, target)
    finally:
        temp.unlink(missing_ok=True)


def _empty():
    return {"version": 1, "configured": False, "enabled": False, "privacy": "minimal", "sealed": False,
            "generation": "", "baseline": None, "floor": 0, "seen": {}, "queue": [],
            "last_outcome": "never", "last_at": None, "dropped": 0, "expired": 0}


def _state(directory):
    value = _json(directory / "state.json", missing=None, limit=STATE_MAX)
    if value is None:
        return _empty()
    if (value.get("version") != 1 or not isinstance(value.get("queue"), list)
            or len(value["queue"]) > QUEUE_MAX or not isinstance(value.get("seen"), dict)
            or len(value["seen"]) > SEEN_MAX):
        raise SourceUnavailable()
    if (any(not isinstance(value.get(k), bool) for k in ("configured", "enabled", "sealed"))
            or value.get("privacy") not in ("minimal", "detail")
            or not isinstance(value.get("generation"), str)
            or not re.fullmatch(r"(?:[0-9a-f]{32})?", value["generation"])
            or (value.get("baseline") is not None and _number(value["baseline"], None) is None)):
        raise SourceUnavailable()
    for item in value["queue"]:
        if (not isinstance(item, dict) or not isinstance(item.get("payload"), dict)
                or item["payload"].get("kind") not in KINDS
                or not re.fullmatch(r"[hacpn]-[0-9a-f]{6,64}", str(item["payload"].get("id")))
                or not isinstance(item.get("identity"), str)
                or any(_number(item.get(k), None) is None for k in ("at", "next", "attempts"))):
            raise SourceUnavailable()
    if any(not isinstance(k, str) or _number(v, None) is None for k, v in value["seen"].items()):
        raise SourceUnavailable()
    if any(_number(value.get(k), None) is None for k in ("floor", "dropped", "expired")):
        raise SourceUnavailable()
    return {**_empty(), **value}


@contextlib.contextmanager
def _locked(directory=None):
    directory = _directory(directory or PRIVATE_DIR)
    fd = os.open(directory / "lock", os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX)
        yield directory
    finally:
        os.close(fd)


def _number(value, default=0):
    return value if isinstance(value, (int, float)) and not isinstance(value, bool) and 0 <= value < 10**15 else default


def status(*, directory=None):
    """Allowlisted read-only metadata; never opens credentials or creates a directory."""
    directory = Path(directory or PRIVATE_DIR)
    try:
        s = _state(directory)
        present = (directory / "credentials.json").is_file() and not (directory / "credentials.json").is_symlink()
        outcome = s.get("last_outcome") if s.get("last_outcome") in OUTCOMES else "state-unavailable"
    except (OSError, SourceUnavailable):
        s, present, outcome = _empty(), False, "state-unavailable"
    return {"configured": s.get("configured") is True and present,
            "enabled": s.get("enabled") is True and present,
            "privacy": "detail" if s.get("privacy") == "detail" else "minimal",
            "sealed": s.get("sealed") is True, "protocol_ready": PROTOCOL == "bearer-json-v1",
            "pending": len(s.get("queue", [])), "last_outcome": outcome,
            "last_at": _number(s.get("last_at"), None),
            "dropped": _number(s.get("dropped")), "expired": _number(s.get("expired"))}


def _validate(url, key, auth_header="Authorization", mode="bearer"):
    if not isinstance(url, str) or not isinstance(key, str) or not 1 <= len(key) <= 4096 or len(url) > 4096:
        raise NotifyError("Enter a valid HTTPS webhook URL and sender key")
    try:
        p = urllib.parse.urlsplit(url)
        port = p.port
    except ValueError:
        raise NotifyError("Enter a valid HTTPS webhook URL") from None
    if (p.scheme != "https" or not p.hostname or p.username is not None or p.password is not None
            or p.fragment or any(ord(c) < 33 or ord(c) == 127 for c in url)
            or not key.isascii() or key != key.strip() or any(ord(c) < 32 or ord(c) == 127 for c in key)):
        raise NotifyError("Use HTTPS without URL user information or a fragment; credentials must be one line")
    if isinstance(auth_header, str) and auth_header.lower() == "authorization":
        auth_header = "Authorization"
    if auth_header != "Authorization" and not re.fullmatch(r"(?i)X-[A-Za-z0-9-]{1,60}", str(auth_header)):
        raise NotifyError("The authentication header must be Authorization or an X- header")
    if mode not in ("bearer", "openbot"):
        raise NotifyError("Unknown phone-alert sender mode")
    return {"url": url, "key": key, "auth_header": auth_header, "mode": mode}


def _crypt(mode, raw):
    try:
        result = subprocess.run(["systemd-creds", "--user", "--name=pal-notify", mode, "-", "-"],
                                input=raw, capture_output=True, timeout=3)
        return result.stdout if result.returncode == 0 and len(result.stdout) <= 65536 else None
    except (OSError, subprocess.TimeoutExpired):
        return None


def _unseal(blob):
    return _crypt("decrypt", blob)


def configure(url, key, *, allow_plain=False, privacy="minimal", auth_header="Authorization", mode="bearer", directory=None):
    """Replace credentials atomically, disabled. URL/key must come from hidden owner input."""
    bundle = _validate(url, key, auth_header, mode)
    if privacy not in ("minimal", "detail"):
        raise NotifyError("Privacy must be minimal or detail")
    raw = json.dumps(bundle, separators=(",", ":")).encode()
    sealed = _crypt("encrypt", raw) if shutil.which("systemd-creds") else None
    if sealed is not None and _unseal(sealed) != raw:
        sealed = None
    if sealed is not None and allow_plain:
        raise NotifyError("User-bound credential sealing is available; run setup without --allow-plain")
    if sealed is None and not allow_plain:
        raise NotifyError("User-bound credential sealing is unavailable; setup needs explicit plaintext-storage consent")
    try:
        with _locked(directory) as folder:
            # Disable first: a crash between these writes cannot send using changed credentials.
            s = _empty()
            s.update(privacy=privacy, generation=secrets.token_hex(16), last_outcome="configured", last_at=time.time())
            _write(folder, "state.json", s)
            secret = {"format": "sealed", "blob": sealed.decode()} if sealed is not None else {"format": "plain", "bundle": bundle}
            _write(folder, "credentials.json", secret)
            s.update(configured=True, sealed=sealed is not None)
            _write(folder, "state.json", s)
    except (OSError, SourceUnavailable, UnicodeError):
        raise NotifyError("Phone-alert configuration could not be saved") from None
    return status(directory=directory)


def _credentials(directory):
    info = (directory / "credentials.json").lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077:
        raise NotifyError("Phone-alert credentials must be private to this user")
    doc = _json(directory / "credentials.json")
    if not doc:
        raise NotifyError("Phone-alert credentials are unavailable")
    if doc.get("format") == "sealed" and isinstance(doc.get("blob"), str):
        raw = _unseal(doc["blob"].encode())
        try:
            bundle = json.loads(raw) if raw else None
        except (ValueError, UnicodeError):
            bundle = None
    elif doc.get("format") == "plain":
        bundle = doc.get("bundle")
    else:
        bundle = None
    if not isinstance(bundle, dict):
        raise NotifyError("Phone-alert credentials are unavailable")
    return _validate(bundle.get("url"), bundle.get("key"), bundle.get("auth_header", "Authorization"), bundle.get("mode", "bearer"))


def _mutate(fn, directory=None):
    try:
        with _locked(directory) as folder:
            s = _state(folder)
            fn(s)
            _write(folder, "state.json", s)
    except (OSError, SourceUnavailable):
        raise NotifyError("Phone-alert state is unavailable") from None
    return status(directory=directory)


def enable(*, directory=None, data=None):
    if PROTOCOL != "bearer-json-v1":
        raise NotifyError("The webhook request protocol has not been confirmed")
    def change(s):
        if not s["configured"]:
            raise NotifyError("Configure phone alerts first")
        if not s["enabled"]:
            # Baseline every off-to-on transition; new work during daemon downtime while
            # enabled is still recovered because baseline is not reset by Worker startup.
            now = time.time()
            events = collect_events(Path(data or DATA), now)
            s.update(enabled=True, baseline=now, floor=int(now * 1000),
                     seen={e["identity"]: e["at"] for e in events}, queue=[], generation=secrets.token_hex(16))
            _trim_seen(s)
    return _mutate(change, directory)


def disable(*, directory=None):
    """Cancel pending alerts. A request already handed to the network cannot be recalled."""
    def change(s):
        s.update(enabled=False, queue=[], generation=secrets.token_hex(16), last_outcome="disabled", last_at=time.time())
    return _mutate(change, directory)


def set_privacy(privacy, *, directory=None):
    if privacy not in ("minimal", "detail"):
        raise NotifyError("Privacy must be minimal or detail")
    def change(s):
        s["privacy"] = privacy
        if privacy == "minimal":
            for item in s["queue"]:
                item["payload"] = {k: item["payload"][k] for k in ("kind", "id")}
        # Discard any transport result prepared under the previous privacy setting.
        s["generation"] = secrets.token_hex(16)
    return _mutate(change, directory)


def send_test(*, directory=None):
    if PROTOCOL != "bearer-json-v1":
        raise NotifyError("The webhook request protocol has not been confirmed")
    def change(s):
        if not s["configured"]:
            raise NotifyError("Configure phone alerts first")
        if len(s["queue"]) >= QUEUE_MAX:
            raise NotifyError("Phone-alert queue is full")
        now = time.time()
        identity = "test:" + secrets.token_hex(16)
        s["queue"].append({"identity": identity, "at": now, "next": now, "attempts": 0,
                           "payload": {"kind": "test", "id": "n-" + identity[5:]}})
        s.update(last_outcome="queued", last_at=now)
    return _mutate(change, directory)


def _text(value, cap):
    return " ".join(value.split())[:cap] if isinstance(value, str) else ""


def _event(kind, item_id, at, title="", topic="", transition=""):
    if kind not in KINDS or not re.fullmatch(r"[hacpn]-[0-9a-f]{6,64}", str(item_id)):
        return None
    at = _number(at)
    if not at:
        return None
    return {"identity": f"{kind}:{item_id}:{transition}", "kind": kind, "id": item_id, "at": at,
            "title": _text(title, 160), "topic": _text(topic, 120)}


def _files(root, pattern):
    if root.is_symlink():
        raise SourceUnavailable()
    files = []
    for p in root.glob(pattern):
        files.append(p)
        if len(files) > SOURCE_MAX:
            raise SourceUnavailable()
    return files


def collect_events(data, now=None):
    """Read durable source metadata without calling APIs that mutate or expose bodies.

    Recovery is limited to records retained by the source itself. Partial/unreadable
    sources abort this scan so they cannot accidentally cancel pending alerts.
    """
    now = time.time() if now is None else now
    events = []
    home = _json(data / "crew-home/home.json", {})
    if not isinstance(home.get("items", []), list):
        raise SourceUnavailable()
    for item in home.get("items", []):
        if not isinstance(item, dict):
            raise SourceUnavailable()
        if isinstance(item, dict) and item.get("status") == "open" and item.get("kind") in ("ask", "login"):
            events.append(_event(item["kind"], item.get("id"), item.get("at"), item.get("title"), item.get("topic", item.get("by"))))
    for f in _files(data / "crew-approvals", "*.json"):
        item = _json(f, {})
        if item.get("status") == "pending":
            # Approval commands are never used as titles, even in detail mode.
            events.append(_event("approval", item.get("id"), item.get("at"), "Approval needed",
                                 _text(item.get("bot"), 80) + "#" + _text(item.get("channel"), 40)))
    for f in _files(data / "crew-proposals", "*.json"):
        item = _json(f, {})
        if item.get("status") == "pending" and _number(item.get("at")) >= (now - 7 * TTL) * 1000:
            events.append(_event("proposal", item.get("id"), item.get("at"), "Proposal needs review", item.get("by", item.get("pal"))))
    # Only card front matter/title/receipts are interpreted; body/attachment fields
    # are never included in an event. Parse uses the same format as the Desk itself.
    import crewdesk
    for f in _files(data / "crew-desk", "*/open/*.md"):
        raw = _read(f)
        if raw is None:
            continue
        try:
            card = crewdesk.parse(raw)
        except crewdesk.Unreadable:
            raise SourceUnavailable() from None
        if card.get("status") in crewdesk.CLOSED or card.get("status") == "draft":
            continue
        owner_tray = f.parent.parent.name == "_owner"
        if not owner_tray and card.get("status") != "needs you":
            continue
        receipts = [r for r in card.get("receipts", []) if r.get("status") == "needs you"]
        stamp = receipts[-1].get("at") if receipts else card.get("created")
        at = int(crewdesk.parse_iso(stamp) * 1000)
        events.append(_event("desk", card.get("id"), at, card.get("title"), card.get("from"), str(at)))
    raw = _tail(data / "crew-helpers/log.jsonl")
    for line in raw.splitlines():
        try:
            item = json.loads(line)
        except (ValueError, RecursionError):
            continue  # a concurrent append can leave the last line temporarily partial
        if not isinstance(item, dict) or item.get("kind") != "switch" or item.get("action") not in ("off", "remove"):
            continue
        at = _number(item.get("at"))
        opaque = hashlib.sha256(json.dumps([at, item.get("helper"), item.get("action")], sort_keys=True).encode()).hexdigest()[:32]
        events.append(_event("helper-off", "n-" + opaque, at, "Trusted helper switched off", item.get("helper")))
    if len(events) > SOURCE_MAX:
        raise SourceUnavailable()
    return [e for e in events if e]


def _source_stamp(data):
    """Cheap metadata checks avoid parsing unchanged source bodies on each tick."""
    files = [data / "crew-home/home.json", data / "crew-helpers/log.jsonl"]
    for root, pattern in (("crew-approvals", "*.json"), ("crew-proposals", "*.json"),
                          ("crew-desk", "*/open/*.md")):
        files.extend(_files(data / root, pattern))
    stamps = []
    for path in sorted(files):
        if any(parent.is_symlink() for parent in path.parents):
            raise SourceUnavailable()
        try:
            info = path.lstat()
        except FileNotFoundError:
            stamps.append((str(path), None))
            continue
        if not stat.S_ISREG(info.st_mode):
            raise SourceUnavailable()
        stamps.append((str(path), info.st_dev, info.st_ino, info.st_mtime_ns,
                       info.st_ctime_ns, info.st_size))
    return tuple(stamps)


def _report_disabled(data, outcome):
    """Only fixed human-readable text reaches Home/feed, never transport details.

    These APIs use process-global DATA. A caller overriding the worker's data root
    must inject a reporter, or set CREW_DATA before importing the process modules.
    Never let a standalone sandbox worker write the real Home/feed by accident.
    """
    if Path(data).resolve() != DATA.resolve():
        return
    reasons = {
        "rejected": "The receiver rejected an alert. Check its configuration and sender key.",
        "redirect-refused": "The receiver redirected an alert. Configure its final HTTPS address.",
        "protocol-unconfirmed": "The receiver protocol is unavailable in this build.",
        "tls-error": "The receiver's secure connection could not be verified. Check its TLS configuration.",
        "credentials-unavailable": "The saved receiver credentials could not be opened. Run phone-alert setup again.",
    }
    title = "Phone alerts turned off: " + reasons.get(outcome, "Check the phone-alert settings.")
    # Each sink is independent: a full Home must not prevent a feed notice.
    import crewlib
    import crewhome
    try:
        # An open ask stays on Home until acknowledged; ordinary notes only appear
        # in Today's drawer. No pal authored this system notice or needs a reply.
        crewhome.add("ask", title, by="", options=("Noted",),
                     body="Alerts are off and queued alerts were cancelled. After fixing the issue, enable phone alerts in Settings.")
    except Exception:
        pass
    try:
        crewlib.feed("notify", status="disabled", title=title)
    except Exception:
        pass


def _trim_seen(s):
    if len(s["seen"]) > SEEN_MAX:
        ordered = sorted(s["seen"].items(), key=lambda pair: pair[1])
        removed = ordered[:-SEEN_MAX]
        s["floor"] = max(s["floor"], max(v for _, v in removed) + 1)
        s["seen"] = dict(ordered[-SEEN_MAX:])


def _payload(event, privacy):
    p = {"kind": event["kind"], "id": event["id"]}
    if privacy == "detail":
        p.update(title=event["title"], topic=event["topic"])
    return p


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def _post(bundle, payload):
    """Only run in the bounded child; no raw response or exception escapes."""
    if PROTOCOL != "bearer-json-v1":
        return "protocol-unconfirmed"
    event_at, delivery_id = bundle.get("event_at"), bundle.get("delivery_id")
    bundle = _validate(bundle.get("url"), bundle.get("key"), bundle.get("auth_header", "Authorization"), bundle.get("mode", "bearer"))
    headers = {"Content-Type": "application/json"}
    if bundle["mode"] == "openbot":
        if (_number(event_at, None) is None or not isinstance(delivery_id, str)
                or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._:-]{0,255}", delivery_id)):
            return "rejected"
        try:
            occurred = datetime.datetime.fromtimestamp(event_at, datetime.timezone.utc).isoformat().replace("+00:00", "Z")
        except (ValueError, OverflowError, OSError):
            return "rejected"
        data = {"kind": payload["kind"], "id": payload["id"],
                "title": payload.get("title", ""), "topic": payload.get("topic", "")}
        body = json.dumps({"type": payload["kind"], "occurredAt": occurred, "data": data},
                          separators=(",", ":"), ensure_ascii=False).encode("utf-8")
        timestamp = str(int(time.time()))
        signed = timestamp.encode() + b"." + delivery_id.encode() + b"." + body
        headers.update({"x-openbot-timestamp": timestamp, "x-openbot-delivery-id": delivery_id,
                        "x-openbot-signature": "sha256=" + hmac.new(bundle["key"].encode(), signed, hashlib.sha256).hexdigest()})
    else:
        auth = bundle["auth_header"]
        headers[auth] = ("Bearer " if auth == "Authorization" else "") + bundle["key"]
        body = json.dumps(payload, separators=(",", ":")).encode()
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), _NoRedirect(),
                                         urllib.request.HTTPSHandler(context=ssl.create_default_context()))
    request = urllib.request.Request(bundle["url"], data=body, headers=headers, method="POST")
    try:
        with opener.open(request, timeout=POST_TIMEOUT - 1) as response:
            code = response.status  # Don't read or log the response body.
    except urllib.error.HTTPError as error:
        code = error.code
        error.close()
    except urllib.error.URLError as error:
        return _tls_outcome(error.reason)
    except ssl.SSLError as error:
        return _tls_outcome(error)
    except (OSError, ValueError):
        return "retry"
    if 200 <= code < 300:
        return "sent"
    if 300 <= code < 400:
        return "redirect-refused"
    if code in (408, 425, 429) or 500 <= code < 600:
        return "retry"
    return "rejected"


def _tls_outcome(error):
    # Certificate failures need an actionable status, but keep the normal retry
    # schedule so alerts recover if the receiver's certificate is fixed.
    return "tls-error" if isinstance(error, ssl.SSLCertVerificationError) else "retry"


def transport(bundle, payload):
    """Hard wall deadline includes DNS/TLS/slow headers; child receives secrets only on stdin."""
    try:
        result = subprocess.run([sys.executable, str(Path(__file__).resolve()), "--post"],
                                input=json.dumps({"credentials": bundle, "payload": payload}).encode(),
                                stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=POST_TIMEOUT,
                                start_new_session=True)
    except subprocess.TimeoutExpired:
        return "timeout"
    except OSError:
        return "transport-error"
    value = result.stdout.decode("ascii", errors="ignore").strip()
    return value if result.returncode == 0 and value in OUTCOMES else "transport-error"


def _transport_main():
    # Keep the deadline even if crewd dies while this child is in flight.
    def deadline(_signum, _frame):
        raise TimeoutError()
    signal.signal(signal.SIGALRM, deadline)
    signal.alarm(POST_TIMEOUT)
    try:
        raw = sys.stdin.buffer.read(32769)
        if len(raw) > 32768:
            return "rejected"
        packet = json.loads(raw)
        payload = packet["payload"]
        if (not isinstance(payload, dict) or set(payload) - {"kind", "id", "title", "topic"}
                or payload.get("kind") not in KINDS or not re.fullmatch(r"[hacpn]-[0-9a-f]{6,64}", payload.get("id", ""))):
            return "rejected"
        return _post(packet["credentials"], payload)
    except Exception:
        return "transport-error"
    finally:
        signal.alarm(0)


class Worker:
    def __init__(self, data=None, directory=None, *, sender=None, clock=None, jitter=None, reporter=None):
        self.data = Path(data or DATA)
        self.directory = Path(directory or PRIVATE_DIR)
        self.sender = sender or transport
        self.clock = clock or time.time
        self.jitter = jitter or random.uniform
        self.reporter = reporter or _report_disabled
        self._scan_stamp = None
        self._scan_events = None
        self._scan_at = 0
        self._stop = threading.Event()
        self._thread = None

    def start(self):
        if self._thread is None or not self._thread.is_alive():
            self._stop.clear()
            self._thread = threading.Thread(target=self._run, name="pal-phone-alerts", daemon=True)
            self._thread.start()
        return self

    def stop(self):
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=POST_TIMEOUT + 1)

    def _run(self):
        while not self._stop.is_set():
            try:
                self.step()
            except Exception:
                # Never leak a URL/key, payload, source body or exception traceback.
                pass
            self._stop.wait(INTERVAL)

    def scan(self):
        now = self.clock()
        stamp = _source_stamp(self.data)
        if (self._scan_events is None or stamp != self._scan_stamp
                or not 0 <= now - self._scan_at < SCAN_INTERVAL):
            events = collect_events(self.data, now)
            self._scan_events, self._scan_stamp, self._scan_at = events, stamp, now
        return self._scan_events

    def step(self):
        if not (self.directory / "state.json").exists():
            return  # Off by default, including no new on-disk state.
        try:
            folder = _directory(self.directory)
            fd = os.open(folder / "send.lock", os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
            try:
                fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                self._step()
            finally:
                os.close(fd)
        except (OSError, NotifyError):
            return  # An overlapping crewd already owns the sender, or storage is unsafe.

    def _step(self):
        now = self.clock()
        try:
            with _locked(self.directory) as folder:
                s = _state(folder)
                if not s["configured"]:
                    return
                previous = copy.deepcopy(s)
                if s["enabled"]:
                    try:
                        events = self.scan()
                    except Exception:
                        if s["last_outcome"] != "source-unavailable":
                            s.update(last_outcome="source-unavailable", last_at=now)
                            _write(folder, "state.json", s)
                        return
                    current = {e["identity"] for e in events}
                    s["queue"] = [q for q in s["queue"] if q["payload"]["kind"] in ("helper-off", "test") or q["identity"] in current]
                    for event in sorted(events, key=lambda e: (e["at"], e["identity"])):
                        key = event["identity"]
                        if key in s["seen"] or event["at"] < s["floor"]:
                            continue
                        s["seen"][key] = event["at"]
                        if len(s["queue"]) >= QUEUE_MAX:
                            s["dropped"] += 1
                        else:
                            s["queue"].append({"identity": key, "at": event["at"] / 1000, "next": now,
                                               "attempts": 0, "payload": _payload(event, s["privacy"])})
                    _trim_seen(s)
                elif not s["queue"]:
                    return
                keep = []
                for q in s["queue"]:
                    if now - q["at"] >= TTL:
                        s["expired"] += 1
                        s.update(last_outcome="expired", last_at=now)
                    else:
                        keep.append(q)
                s["queue"] = keep
                due = next((q for q in keep if q["next"] <= now and (s["enabled"] or q["payload"]["kind"] == "test")), None)
                if s != previous:
                    _write(folder, "state.json", s)  # Persist changed dedupe/outbox before network.
                if due is None:
                    return
                generation = s["generation"]
                payload = {k: due["payload"][k] for k in ("kind", "id")}
                if s["privacy"] == "detail" and payload["kind"] != "test":
                    payload.update(title=_text(due["payload"].get("title"), 160),
                                   topic=_text(due["payload"].get("topic"), 120))
            # Decryption can take seconds, so it must not stall the owner's controls.
            outcome = None
            try:
                bundle = _credentials(folder)
                if bundle.get("mode") == "openbot":
                    bundle.update(event_at=due["at"], delivery_id="p-" + hashlib.sha256(due["identity"].encode()).hexdigest())
            except (NotifyError, SourceUnavailable, OSError):
                outcome = "credentials-unavailable"
            with _locked(self.directory) as folder:
                s = _state(folder)
                if (s["generation"] != generation
                        or not any(q["identity"] == due["identity"] for q in s["queue"])):
                    return  # An owner action during decryption cancels the prepared send.
            # Network never holds the state lock or the daemon's main-loop thread.
            if outcome is None:
                try:
                    outcome = self.sender(bundle, payload)
                except Exception:
                    outcome = "transport-error"
            if outcome not in OUTCOMES:
                outcome = "transport-error"
            report = False
            with _locked(self.directory) as folder:
                s = _state(folder)
                if s["generation"] != generation:
                    return  # Disable, replacement or privacy change won the race.
                q = next((x for x in s["queue"] if x["identity"] == due["identity"]), None)
                if q is None:
                    return
                s.update(last_outcome=outcome, last_at=self.clock())
                if outcome == "sent":
                    s["queue"].remove(q)
                elif outcome in ("rejected", "redirect-refused", "protocol-unconfirmed",
                                 "credentials-unavailable"):
                    s["enabled"] = False
                    s["queue"] = []
                    report = True
                else:
                    q["attempts"] += 1
                    delay = (2, 10, 30, 60, 120, 300)[min(q["attempts"] - 1, 5)]
                    q["next"] = self.clock() + delay * self.jitter(0.8, 1.2)
                _write(folder, "state.json", s)
            if report:
                try:
                    self.reporter(self.data, outcome)
                except Exception:
                    pass  # Do not expose reporter exceptions or retry a permanent failure.
        except (OSError, SourceUnavailable):
            return


if __name__ == "__main__":
    if sys.argv[1:] == ["--post"]:
        print(_transport_main())
    else:
        raise SystemExit("Use pal notify; no credential display command exists")
