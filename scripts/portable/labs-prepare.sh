#!/bin/sh
set -eu
labs=$(CDPATH= cd -P "$(dirname "$0")" && pwd)
revision=$(cat "$labs/portable/revision")
active="$labs/.venv"
if [ -x "$active/bin/python" ] && [ -f "$active/.portable-ready" ] &&
   [ "$(cat "$active/.portable-ready")" = "$revision" ]; then
  exit 0
fi

printf '%s\n' '正在准备本机 Python 实验，首次启动请稍候。' 'Preparing the offline Python labs for first use…'
staging=$(mktemp -d "$labs/.prepare.XXXXXXXX")
trap 'rm -rf "$staging"' EXIT
trap 'exit 1' HUP INT TERM
installed="$labs/.runtime-$revision"
if [ -x "$installed/bin/python" ] && [ -f "$installed/.portable-ready" ]; then
  python="$installed/bin/python"
else
  tar -xzf "$labs/portable/python.tar.gz" -C "$staging"
  python="$staging/python/bin/python"
  PIP_CONFIG_FILE=/dev/null "$python" -I -m pip --isolated --disable-pip-version-check install \
    --no-index --find-links "$labs/portable/wheels" --require-hashes --only-binary=:all: \
    --no-cache-dir --no-compile --no-deps -r "$labs/portable/requirements.lock"
  "$python" -I -c 'import cv2, duckdb, numpy, pandas, sqlite3'
  printf '%s\n' "$revision" > "$staging/python/.portable-ready"
fi

# Publish complete installations atomically; two simultaneous launches may finish together.
# The relative .venv link still resolves after the game directory has been moved.
"$python" -I -B -S - "$labs" "$staging" "$installed" <<'PY'
from pathlib import Path
import errno
import os
import sys

labs, staging, installed = map(Path, sys.argv[1:])
candidate = staging / 'python'
if candidate.is_dir():
    try:
        candidate.rename(installed)
    except OSError as error:
        if error.errno not in (errno.EEXIST, errno.ENOTEMPTY) or not (installed / '.portable-ready').is_file():
            raise
active = labs / '.venv'
if active.exists() and not active.is_symlink():
    raise SystemExit(f'Please move the existing {active} directory aside, then start the game again.')
link = staging / 'active'
link.symlink_to(installed.name, target_is_directory=True)
os.replace(link, active)
PY
