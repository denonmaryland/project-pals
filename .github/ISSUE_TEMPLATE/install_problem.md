---
name: Install problem
about: Installation, update, rollback or uninstall failed
title: "[Install] "
labels: ''
assignees: ''
---

<!-- Search existing issues first. Issues are public: no credentials, private paths,
project/pal names, session transcripts or unedited logs/screenshots. One problem per issue. -->

### Which step failed?

<!-- Fresh install / update / rollback / uninstall. Give the command or button and flags,
with private paths removed. Release download or clone? Which version? -->

### What happened?

<!-- Expected result, actual result, and a short manually redacted error excerpt if useful. -->

### Environment

<!-- Distro, Herdr and hc versions; desktop Linux, WSL or container?
Is a systemd user session available? Had you opened Herdr once before installing? -->

### What have you already tried?

<!-- No need to purge data or repeat a failed install just to file this report. -->

### Diagnostic report

<!-- Run `pal report`, review it, and paste the output below. It uploads nothing and
omits raw error text. If pal wasn't installed, run `python3 bin/crew report` in the downloaded
source folder. If this version has neither, enter Project Pals, Herdr and hc versions manually.
No need to reinstall to report a failure. Harness detection checks PATH, not login or compatibility.
More: https://github.com/denonmaryland/project-pals/blob/main/CONTRIBUTING.md -->

### Optional screenshot or short error excerpt

<!-- Check and redact it yourself; pal report does not sanitize attachments or pasted text. -->
