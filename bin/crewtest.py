"""Run a test command with isolated Herdr state and a read-only owner filesystem."""
import os
import pwd
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path


def main(args):
    if not args:
        print("usage: crewtest.py command [args...]", file=sys.stderr)
        return 2
    bwrap = shutil.which("bwrap")
    if not bwrap:
        print("bubblewrap is required to run the test suite safely", file=sys.stderr)
        return 2
    with tempfile.TemporaryDirectory(prefix="pals-test-isolation-", dir="/tmp") as tmp:
        root = Path(tmp)
        for name in ("home", "app", "data", "runtime", "empty"):
            (root / name).mkdir()
        real_data = (Path(pwd.getpwuid(os.getuid()).pw_dir) / ".config/herdr-app/data").resolve()
        mounts = ["--ro-bind", str(root / "empty"), str(real_data)] if real_data.is_dir() else []
        runtime = Path("/run/user") / str(os.getuid())
        if runtime.is_dir():
            mounts += ["--tmpfs", str(runtime)]
        cmd = [bwrap, "--die-with-parent", "--ro-bind", "/", "/", "--bind", "/tmp", "/tmp",
               "--dev-bind", "/dev", "/dev", "--proc", "/proc", *mounts, "--unshare-net", "--unshare-pid",
               "--setenv", "HOME", str(root / "home"), "--setenv", "HERDR_APP_HOME", str(root / "app"),
               "--setenv", "CREW_DATA", str(root / "data"), "--setenv", "XDG_RUNTIME_DIR", str(root / "runtime")]
        for key in ("HC_TERMINAL_SOCKET", "HC_TERMINAL_ID", "HC_SCOPE", "HC_SESSION", "WAYLAND_DISPLAY", "DISPLAY"):
            cmd += ["--unsetenv", key]
        return subprocess.run([*cmd, "--", *args]).returncode


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
