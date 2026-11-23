#!/bin/sh
set -eu
kit=$(CDPATH= cd -P "$(dirname "$0")" && pwd)
if [ "$(uname -s)" != Darwin ]; then
  echo "请在发布用的 Mac 上运行。 / Run this on the release Mac." >&2
  exit 1
fi
# A native host Node can also drive an Intel build on Apple Silicon with Rosetta.
if command -v node >/dev/null 2>&1 && node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 22 ? 0 : 1)'; then
  exec node "$kit/release-tools/publish.mjs" "$@"
fi
exec "$kit/payload/runtime/bin/node" "$kit/release-tools/publish.mjs" "$@"
