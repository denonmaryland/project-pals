"""Phone alerts: fake credentials/endpoints only; no live services or network."""
import importlib.machinery
import importlib.util
import io
import json
import os
from pathlib import Path
import ssl
import subprocess
import sys
import tempfile
import threading
import unittest
import urllib.error
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "bin"))
import crewnotify as n


class Notify(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.base = Path(self.tmp.name)
        self.directory = self.base / "private"
        self.data = self.base / "data"
        self.data.mkdir()
        self.now = 2000000000.0
        self.clock = patch.object(n.time, "time", side_effect=lambda: self.now)
        self.clock.start()
        self.crypto = patch.object(n, "_crypt", return_value=None)
        self.crypto.start()
        self.sent = []
        self.outcome = "sent"
        self.worker = n.Worker(self.data, self.directory, sender=self.sender,
                               clock=lambda: self.now, jitter=lambda a, b: 1)

    def tearDown(self):
        self.crypto.stop()
        self.clock.stop()
        self.tmp.cleanup()

    def sender(self, bundle, payload):
        self.sent.append((bundle, payload))
        return self.outcome

    def configure(self, **kwargs):
        return n.configure("https://example.invalid/private-hook", "PRIVATE-SENDER-KEY", allow_plain=True,
                           directory=self.directory, **kwargs)

    def enable(self):
        return n.enable(directory=self.directory, data=self.data)

    def put(self, rel, value):
        p = self.data / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(json.dumps(value))
        return p

    def home(self, *items):
        self.put("crew-home/home.json", {"items": list(items)})

    def event(self, iid="h-abcdef", kind="ask", **extra):
        return {"id": iid, "kind": kind, "status": "open", "at": int(self.now * 1000),
                "title": "PRIVATE TITLE", "topic": "PRIVATE#TOPIC", "body": "NEVER BODY", **extra}

    def new(self, iid="h-abcdef"):
        self.now += 1
        self.home(self.event(iid))

    def state(self):
        return json.loads((self.directory / "state.json").read_text())

    def test_off_by_default_has_no_files_or_calls(self):
        self.worker.step()
        self.assertFalse(self.directory.exists())
        self.assertFalse(n.status(directory=self.directory)["configured"])
        self.assertFalse(self.directory.exists())
        self.assertFalse(self.sent)

    def test_setup_fallback_is_explicit_private_and_never_read_back(self):
        with self.assertRaisesRegex(n.NotifyError, "explicit plaintext"):
            n.configure("https://example.invalid/hook", "PRIVATE-SENDER-KEY", directory=self.directory)
        self.assertFalse(self.directory.exists())
        result = self.configure()
        self.assertTrue(result["configured"])
        self.assertFalse(result["enabled"])
        self.assertFalse(result["sealed"])
        for text in (json.dumps(result), str(n.status(directory=self.directory))):
            self.assertNotIn("PRIVATE", text)
            self.assertNotIn("example.invalid", text)
        self.assertEqual(self.directory.stat().st_mode & 0o777, 0o700)
        for p in self.directory.iterdir():
            self.assertEqual(p.stat().st_mode & 0o777, 0o600)
        # status must not decrypt/read the credential bundle.
        with patch.object(n, "_credentials", side_effect=AssertionError("read secrets")):
            n.status(directory=self.directory)

    def test_sealed_roundtrip_or_explicit_fallback(self):
        self.crypto.stop()
        def crypt(mode, raw):
            return b"sealed:" + raw if mode == "encrypt" else raw.removeprefix(b"sealed:")
        with patch.object(n, "_crypt", side_effect=crypt), patch.object(n.shutil, "which", return_value="systemd-creds"):
            result = n.configure("https://example.invalid/", "secret", directory=self.directory)
            self.assertTrue(result["sealed"])
            self.assertEqual(n._credentials(self.directory)["key"], "secret")
        self.crypto.start()

    def test_rejects_bad_credentials_with_generic_errors(self):
        for url, key in (("http://secret.invalid", "secret"), ("https://u:secret@example.invalid", "secret"),
                         ("https://example.invalid/#secret", "secret"), ("https://example.invalid:bad", "secret"),
                         ("https://example.invalid/", "secret\nheader"), ("https://example.invalid/", "")):
            with self.assertRaises(n.NotifyError) as cm:
                n.configure(url, key, directory=self.directory)
            self.assertNotIn("secret", str(cm.exception))
        with self.assertRaises(n.NotifyError):
            self.configure(auth_header="Host")

    def test_no_symlink_or_permissive_credentials(self):
        other = self.base / "other"
        other.mkdir()
        self.directory.symlink_to(other, target_is_directory=True)
        with self.assertRaises(n.NotifyError):
            self.configure()
        self.assertFalse(list(other.iterdir()))
        self.directory.unlink()
        self.configure()
        self.enable()
        self.new()
        (self.directory / "credentials.json").chmod(0o644)
        self.worker.step()
        self.assertFalse(self.sent)
        self.assertEqual(n.status(directory=self.directory)["last_outcome"], "credentials-unavailable")
        self.assertFalse(n.status(directory=self.directory)["enabled"])

    def test_missing_credentials_pause_with_generic_status(self):
        self.configure()
        self.enable()
        self.new()
        (self.directory / "credentials.json").unlink()
        self.worker.step()
        self.assertFalse(self.state()["enabled"])
        self.assertEqual(self.state()["last_outcome"], "credentials-unavailable")
        self.assertFalse(self.sent)

    def test_initial_baseline_restart_dedupe_and_off_to_on(self):
        self.home(self.event("h-111111"))
        self.configure()
        self.enable()
        self.worker.step()
        self.assertFalse(self.sent)
        self.new("h-222222")
        n.Worker(self.data, self.directory, sender=self.sender, clock=lambda: self.now).step()
        self.assertEqual(len(self.sent), 1)
        self.worker.step()
        self.assertEqual(len(self.sent), 1)
        n.disable(directory=self.directory)
        self.new("h-333333")
        self.enable()
        self.worker.step()
        self.assertEqual(len(self.sent), 1)  # No backlog storm after deliberate disable.

    def test_minimal_allowlist_and_detail_mode(self):
        self.configure()
        self.enable()
        self.new()
        self.worker.step()
        self.assertEqual(self.sent[0][1], {"kind": "ask", "id": "h-abcdef"})
        self.assertNotIn("PRIVATE TITLE", (self.directory / "state.json").read_text())
        n.set_privacy("detail", directory=self.directory)
        self.new("h-123456")
        self.worker.step()
        self.assertEqual(set(self.sent[-1][1]), {"kind", "id", "title", "topic"})
        self.assertNotIn("NEVER BODY", json.dumps(self.sent))

    def test_retry_backoff_persists_and_expiry(self):
        self.configure()
        self.enable()
        self.new()
        self.outcome = "retry"
        self.worker.step()
        self.assertEqual(self.state()["queue"][0]["next"], self.now + 2)
        self.worker.step()
        self.assertEqual(len(self.sent), 1)
        self.now += 2
        self.worker.step()
        self.assertEqual(self.state()["queue"][0]["next"], self.now + 10)
        self.now += n.TTL
        self.worker.step()
        self.assertEqual(self.state()["expired"], 1)
        self.assertFalse(self.state()["queue"])
        self.assertEqual(len(self.sent), 2)

    def test_resolved_cancelled_before_retry(self):
        self.configure()
        self.enable()
        self.new()
        self.outcome = "retry"
        self.worker.step()
        self.now += 2
        self.home(self.event(status="answered"))
        self.worker.step()
        self.assertEqual(len(self.sent), 1)
        self.assertFalse(self.state()["queue"])

    def test_disable_replacement_and_privacy_change(self):
        self.configure(privacy="detail")
        self.enable()
        self.new()
        self.outcome = "retry"
        self.worker.step()
        self.assertIn("title", self.state()["queue"][0]["payload"])
        n.set_privacy("minimal", directory=self.directory)
        self.assertNotIn("title", self.state()["queue"][0]["payload"])
        n.disable(directory=self.directory)
        self.assertFalse(self.state()["queue"])
        self.assertFalse(self.state()["enabled"])
        self.enable()
        self.new("h-222222")
        self.worker.step()
        self.configure()
        self.assertFalse(self.state()["queue"])
        self.assertFalse(self.state()["enabled"])

    def test_send_test_while_disabled_and_permanent_failure_pauses(self):
        self.configure()
        n.send_test(directory=self.directory)
        self.worker.step()
        self.assertEqual(self.sent[-1][1]["kind"], "test")
        self.assertFalse(self.state()["enabled"])
        self.enable()
        self.new()
        self.outcome = "rejected"
        self.worker.step()
        self.assertFalse(self.state()["enabled"])
        self.assertFalse(self.state()["queue"])
        self.assertEqual(self.state()["last_outcome"], "rejected")

    def test_queue_and_seen_limits_do_not_repeat_old_items(self):
        self.configure()
        self.enable()
        self.now += 1
        self.home(*[self.event(f"h-{i:06x}", at=int(self.now * 1000) + i) for i in range(5)])
        self.outcome = "retry"
        with patch.object(n, "QUEUE_MAX", 2), patch.object(n, "SEEN_MAX", 3):
            self.worker.step()
            s = self.state()
            self.assertEqual(len(s["queue"]), 2)
            self.assertEqual(len(s["seen"]), 3)
            self.assertEqual(s["dropped"], 3)
            self.worker.step()
            self.assertEqual(self.state()["dropped"], 3)

    def test_source_failure_keeps_pending_without_sending(self):
        self.configure()
        self.enable()
        self.new()
        self.outcome = "retry"
        self.worker.step()
        (self.data / "crew-home/home.json").write_text("{broken")
        self.now += 2
        self.worker.step()
        self.assertEqual(len(self.sent), 1)
        self.assertEqual(len(self.state()["queue"]), 1)
        self.assertEqual(self.state()["last_outcome"], "source-unavailable")

    def test_every_source_without_raw_commands_bodies_or_helper_names_in_ids(self):
        self.home(self.event(), self.event("h-123456", "login", command="NEVER LOGIN"))
        self.put("crew-approvals/a-abcdef.json", {"id": "a-abcdef", "status": "pending", "at": self.now*1000,
                                                "command": "NEVER COMMAND", "bot": "Pal", "channel": "topic"})
        self.put("crew-proposals/p-abcdef.json", {"id": "p-abcdef", "status": "pending", "at": self.now*1000,
                                                "note": "NEVER NOTE", "file": "/private/file", "by": "Pal#topic"})
        import crewdesk
        p = self.data / "crew-desk/_owner/open/card.md"
        p.parent.mkdir(parents=True)
        p.write_text(crewdesk.render({"id": "c-abcdef", "status": "needs you", "kind": "ask",
                                     "title": "Card title", "from": "Pal#topic", "body": "NEVER BODY",
                                     "created": crewdesk.iso(self.now), "receipts": []}))
        self.put("crew-helpers/log.jsonl", {"kind": "switch", "action": "off", "helper": "PRIVATE-HELPER", "at": self.now*1000})
        events = n.collect_events(self.data, self.now)
        self.assertEqual({e["kind"] for e in events}, {"ask", "login", "approval", "proposal", "desk", "helper-off"})
        minimal = [n._payload(e, "minimal") for e in events]
        self.assertNotIn("PRIVATE", json.dumps(minimal))
        self.assertNotIn("NEVER", json.dumps(events))
        self.assertTrue(next(e for e in events if e["kind"] == "helper-off")["id"].startswith("n-"))

    def test_shutdown_while_send_in_flight_does_not_reenable(self):
        self.configure()
        self.enable()
        self.new()
        def sender(bundle, payload):
            n.disable(directory=self.directory)
            return "sent"
        self.worker.sender = sender
        self.worker.step()
        self.assertFalse(self.state()["enabled"])
        self.assertFalse(self.state()["queue"])
        self.assertEqual(self.state()["last_outcome"], "disabled")

    def test_overlapping_workers_do_not_send_twice(self):
        self.configure()
        self.enable()
        self.new()
        started, release = threading.Event(), threading.Event()
        def sender(bundle, payload):
            self.sent.append(payload)
            started.set()
            release.wait(2)
            return "sent"
        self.worker.sender = sender
        thread = threading.Thread(target=self.worker.step)
        thread.start()
        try:
            self.assertTrue(started.wait(2))
            other = n.Worker(self.data, self.directory, sender=self.sender, clock=lambda: self.now)
            other.step()
            self.assertEqual(len(self.sent), 1)
        finally:
            release.set()
            thread.join(2)
        self.assertFalse(thread.is_alive())

    def test_missing_protocol_cannot_enable_or_test(self):
        self.configure()
        with patch.object(n, "PROTOCOL", None):
            self.assertFalse(n.status(directory=self.directory)["protocol_ready"])
            with self.assertRaises(n.NotifyError): self.enable()
            with self.assertRaises(n.NotifyError): n.send_test(directory=self.directory)


    def test_helper_log_tail_and_malformed_source_are_bounded(self):
        p = self.data / "crew-helpers/log.jsonl"
        p.parent.mkdir()
        entry = {"kind": "switch", "action": "off", "helper": "Private", "at": self.now * 1000}
        p.write_text("x" * (n.FILE_MAX + 10) + "\n" + json.dumps(entry) + "\n")
        self.assertEqual(len(n.collect_events(self.data, self.now)), 1)
        self.configure()
        self.enable()
        self.new()
        with patch.object(self.worker, "scan", side_effect=TypeError("PRIVATE detail")):
            self.worker.step()
        self.assertEqual(self.state()["last_outcome"], "source-unavailable")
        self.assertFalse(self.sent)
        self.assertNotIn("PRIVATE", json.dumps(n.status(directory=self.directory)))

    def test_malformed_state_fails_closed(self):
        self.configure()
        p = self.directory / "state.json"
        valid = self.state()
        for changes in ({"enabled": "yes"}, {"privacy": []}, {"queue": [{"payload": {}}]}, {"seen": {"x": []}}):
            p.write_text(json.dumps({**valid, **changes}))
            self.worker.step()
            self.assertFalse(self.sent)
            self.assertEqual(n.status(directory=self.directory)["last_outcome"], "state-unavailable")
            with self.assertRaises(n.NotifyError):
                n.set_privacy("minimal", directory=self.directory)

    def test_crewd_starts_worker_before_terminal_tick(self):
        loader = importlib.machinery.SourceFileLoader("notify_test_crewd", str(ROOT / "bin/crewd"))
        spec = importlib.util.spec_from_loader(loader.name, loader)
        module = importlib.util.module_from_spec(spec)
        loader.exec_module(module)
        daemon = object.__new__(module.Crewd)
        order = []
        def tick():
            order.append("tick")
            raise KeyboardInterrupt()
        daemon.tick = tick
        class FakeWorker:
            def start(self):
                order.append("worker")
                return self
        with patch.object(module.crewnotify, "Worker", return_value=FakeWorker()), \
                patch.object(module.threading, "Thread") as refresh, patch.object(module, "log"):
            with self.assertRaises(KeyboardInterrupt):
                daemon.run()
        self.assertEqual(order, ["worker", "tick"])


class Transport(unittest.TestCase):
    def test_hard_timeout_and_no_credentials_in_argv(self):
        bundle = {"url": "https://example.invalid/private", "key": "SECRET-KEY"}
        with patch.object(n.subprocess, "run", side_effect=subprocess.TimeoutExpired("python", 5)) as run:
            self.assertEqual(n.transport(bundle, {"kind": "test", "id": "n-abcdef"}), "timeout")
        args, kw = run.call_args
        self.assertNotIn("SECRET", str(args))
        self.assertNotIn("private", str(args))
        self.assertIn(b"SECRET-KEY", kw["input"])
        self.assertEqual(kw["stderr"], subprocess.DEVNULL)
        self.assertEqual(kw["timeout"], n.POST_TIMEOUT)

    def test_transport_timeout_reaps_real_synthetic_child(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            script, pid = root / "slow.py", root / "pid"
            script.write_text("import os,time\nfrom pathlib import Path\nPath(" + repr(str(pid)) + ").write_text(str(os.getpid()))\ntime.sleep(30)\n")
            with patch.object(n, "__file__", str(script)), patch.object(n, "POST_TIMEOUT", 0.2):
                self.assertEqual(n.transport({"key": "FAKE"}, {}), "timeout")
            self.assertTrue(pid.exists())
            self.assertFalse(Path("/proc") .joinpath(pid.read_text()).exists())

    def test_post_schema_statuses_redirects_and_tls(self):
        bundle = {"url": "https://example.invalid/hook", "key": "SECRET"}
        class Response:
            status = 204
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def read(self, *args): raise AssertionError("Response body must not be read")
        class Opener:
            def open(self, request, timeout):
                self.request = request
                return Response()
        opener = Opener()
        with patch.object(n.urllib.request, "build_opener", return_value=opener) as build:
            self.assertEqual(n._post(bundle, {"kind": "test", "id": "n-abcdef"}), "sent")
        self.assertEqual(opener.request.headers["Authorization"], "Bearer SECRET")
        self.assertEqual(json.loads(opener.request.data), {"kind": "test", "id": "n-abcdef"})
        self.assertTrue(any(isinstance(x, n._NoRedirect) for x in build.call_args.args))
        self.assertIsNone(n._NoRedirect().redirect_request(None, None, 302, "", {}, "https://evil.invalid"))
        for code, outcome in ((302, "redirect-refused"), (400, "rejected"), (401, "rejected"), (429, "retry"), (503, "retry")):
            with patch.object(opener, "open", side_effect=urllib.error.HTTPError(bundle["url"], code, "SECRET", {}, io.BytesIO(b"SECRET"))), \
                    patch.object(n.urllib.request, "build_opener", return_value=opener):
                self.assertEqual(n._post(bundle, {"kind": "test", "id": "n-abcdef"}), outcome)
        with patch.object(opener, "open", side_effect=urllib.error.URLError(ssl.SSLError("SECRET"))), \
                patch.object(n.urllib.request, "build_opener", return_value=opener):
            self.assertEqual(n._post(bundle, {"kind": "test", "id": "n-abcdef"}), "tls-error")


if __name__ == "__main__":
    unittest.main()
