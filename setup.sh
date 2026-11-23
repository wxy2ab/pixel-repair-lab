#!/bin/sh
set -eu

CDPATH= cd -P "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
    printf '%s\n' '请先安装含 npm 的 Node.js 22.12 或更新版本，再运行初始化脚本。' \
        'Install Node.js 22.12 or newer with npm, then run setup again.' >&2
    exit 127
fi
exec node ./scripts/local-game.mjs setup "$@"
