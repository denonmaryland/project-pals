"""Owner controls for phone alerts. Credential input never travels through argv or a pal."""
import getpass
import json
import os
import re
import warnings

import crewnotify


USAGE = "pal notify [status [--json]|setup [--allow-plain] [--header NAME] [--mode bearer|openbot]|enable|disable|privacy minimal|privacy detail|test]"


def setup_interactive(allow_plain=False, auth_header="Authorization", mode="bearer"):
    import crewhelpers
    import crewuninstall

    # A command the owner types in their own terminal, never an agent-created PTY or a helper.
    # This is the same mistake-prevention boundary as uninstall, not OS isolation.
    if os.environ.get("PAL_HELPER") or crewhelpers.inside_herdr() or crewuninstall.agent_above():
        raise crewnotify.NotifyError("Run pal notify setup yourself in a terminal outside Herdr and any agent.")
    try:
        with open("/dev/tty", "w") as tty:
            if not os.isatty(tty.fileno()):
                raise crewnotify.NotifyError("Setup needs your own interactive terminal.")
            tty.write("Phone alerts: enter the receiver URL and sender key here only. Both inputs are hidden.\n"
                      "They stay on this computer; setup leaves sending disabled.\n")
            if allow_plain:
                tty.write("You allowed a 0600 plaintext fallback if user credential sealing is unavailable.\n")
            tty.flush()
            with warnings.catch_warnings():
                # getpass otherwise falls back to echoed input when terminal control fails.
                warnings.simplefilter("error", getpass.GetPassWarning)
                url = getpass.getpass("Webhook URL (hidden): ", stream=tty)
                key = getpass.getpass("Sender key (hidden): ", stream=tty)
            options = {"allow_plain": allow_plain, "privacy": "minimal", "auth_header": auth_header}
            if mode != "bearer":
                options["mode"] = mode
            crewnotify.configure(url, key, **options)
    except (OSError, EOFError, KeyboardInterrupt, getpass.GetPassWarning):
        raise crewnotify.NotifyError("Setup cancelled or a secure interactive prompt was unavailable.") from None


def run(rest, require_owner):
    """Only setup has the explicit external-terminal path; other mutations require an app click."""
    args = list(rest)
    if args in (["--help"], ["-h"]):
        print(USAGE)
        return
    if not args or args in (["status"], ["--json"], ["status", "--json"]):
        info = crewnotify.status()
        if "--json" in args:
            print(json.dumps(info))
        else:
            print("Phone alerts: " + ("on" if info.get("enabled") else "off"))
            print("Receiver: " + ("configured" if info.get("configured") else "not configured"))
            print("Payload: " + ("kind, id, title and topic" if info.get("privacy") == "detail" else "kind and id only"))
            outcome = info.get("last_outcome") or "none"
            if outcome == "tls-error":
                outcome = "certificate verification failed; check the receiver's TLS certificate (retrying)"
            print("Last delivery: " + str(outcome))
        return
    as_json = args[-1:] == ["--json"]
    if as_json:
        args.pop()
    if args[:1] == ["setup"]:
        if as_json:
            raise crewnotify.NotifyError("Setup is interactive; --json is only for status and app controls.")
        tail, allow_plain, header, header_set, mode, mode_set = args[1:], False, "Authorization", False, "bearer", False
        while tail:
            if tail[0] == "--allow-plain" and not allow_plain:
                allow_plain, tail = True, tail[1:]
            elif tail[0] == "--header" and len(tail) > 1 and not header_set:
                header, tail = tail[1], tail[2:]
                header_set = True
            elif tail[0] == "--mode" and len(tail) > 1 and not mode_set:
                mode, tail, mode_set = tail[1], tail[2:], True
            else:
                raise crewnotify.NotifyError(USAGE)
        if mode not in ("bearer", "openbot") or (mode == "openbot" and header_set):
            raise crewnotify.NotifyError(USAGE)
        if not re.fullmatch(r"Authorization|X-[A-Za-z0-9-]{1,60}", header, flags=re.I):
            raise crewnotify.NotifyError("Use Authorization or a custom X- header.")
        # No credential values are accepted on the command line, even for owner setup.
        if mode == "bearer":
            setup_interactive(allow_plain=allow_plain, auth_header=header)
        else:
            setup_interactive(allow_plain=allow_plain, auth_header=header, mode=mode)
        print("Receiver saved. Sending is off. Open About → Phone alerts to enable or send a test.")
        return
    valid = args in (["enable"], ["disable"], ["test"], ["privacy", "minimal"], ["privacy", "detail"])
    if not valid:
        raise crewnotify.NotifyError(USAGE)
    require_owner("change or test phone alerts")
    if args == ["enable"]:
        crewnotify.enable()
    elif args == ["disable"]:
        crewnotify.disable()
    elif args == ["test"]:
        crewnotify.send_test()
    else:
        crewnotify.set_privacy(args[1])
    if as_json:
        print(json.dumps({"ok": True, **crewnotify.status()}))
    else:
        print("Test alert queued." if args == ["test"] else "Phone alerts updated.")
