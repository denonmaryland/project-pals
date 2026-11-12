"""Test scratch folders that go away (T143).

/tmp is RAM on machines with tmpfs, and the suite used to leave ~250 /tmp/pals-* folders per run
(17,600 had piled up by 2026-11-10, about 1 GB). Every test makes its folders with
pals_tmp.mkdtemp(prefix=...), a drop-in for tempfile.mkdtemp: each one is removed when the test
process exits, however the test ended. Only by the process that made it, so a forked child exiting
never deletes its parent's folders mid-test. A process killed outright (SIGKILL, out of memory) still
leaves its folders; tests/test_tmp_clean.py runs the suite in an empty TMPDIR and fails on any left.
"""
import atexit
import os
import shutil
import tempfile

_made = []   # (pid, path)


def mkdtemp(suffix=None, prefix="pals-", dir=None):
    d = tempfile.mkdtemp(suffix=suffix, prefix=prefix, dir=dir)
    _made.append((os.getpid(), d))
    return d


@atexit.register
def _clean():
    me = os.getpid()
    for pid, d in reversed(_made):
        if pid == me:
            shutil.rmtree(d, ignore_errors=True)
