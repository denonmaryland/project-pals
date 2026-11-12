#!/usr/bin/env bash
# The regression tests in an empty TMPDIR: fails when a test fails, or when anything is left there
# afterwards (T143: /tmp is RAM on tmpfs machines, and the suite used to leave ~250 folders a run).
# The release preflight runs it. On a machine short of memory, cap it:
#   systemd-run --user --scope --quiet --collect -p MemoryMax=2G -- tests/check_tmp.sh
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
# Short on purpose: tests make unix sockets under it, and those paths must stay under 108 bytes.
scratch="$(mktemp -d /tmp/pt-XXXXXX)"
trap 'rm -rf "$scratch"' EXIT
fail=0
TMPDIR="$scratch" python3 -m unittest discover -s tests -q || { echo "tests failed" >&2; fail=2; }
if command -v node >/dev/null; then
  for t in tests/*.mjs; do
    [[ -f "$t" ]] || continue
    TMPDIR="$scratch" node "$t" || { echo "test failed: $t" >&2; fail=2; }
  done
fi
left="$(ls -A "$scratch")"
if [[ -n "$left" ]]; then
  echo "the tests left $(printf '%s\n' "$left" | wc -l) entries in TMPDIR; make scratch folders with" >&2
  echo "pals_tmp.mkdtemp (Python) or rmSync them in a finally (node):" >&2
  printf '%s\n' "$left" | sed 's/^/  /' | head -20 >&2
  fail=2
fi
exit $fail
