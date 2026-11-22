#!/usr/bin/env bash
# The implementation is shipped with the updater so older builds can be tested safely too.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec python3 "$root/bin/crewtest.py" "$@"
