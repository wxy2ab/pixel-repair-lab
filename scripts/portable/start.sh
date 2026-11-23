#!/bin/sh
set -eu

root=$(CDPATH= cd -P "$(dirname "$0")" && pwd)
cd "$root"
target='@TARGET@'
case "$#" in
  0) set -- --open ;;
  1) case "$1" in
       --no-open) shift ;;
       -h|--help) echo "Usage: $0 [--no-open]"; exit 0 ;;
       *) echo "Usage: $0 [--no-open]" >&2; exit 2 ;;
     esac ;;
  *) echo "Usage: $0 [--no-open]" >&2; exit 2 ;;
esac

os=$(uname -s)
cpu=$(uname -m)
case "$os/$cpu" in
  Darwin/arm64) native=macos-arm64 ;;
  Darwin/x86_64) native=macos-x64
    if [ "$target" = macos-arm64 ] && [ "$(sysctl -n hw.optional.arm64 2>/dev/null || true)" = 1 ]; then native=macos-arm64; fi ;;
  Linux/x86_64) native=linux-x64 ;;
  Linux/aarch64|Linux/arm64) native=linux-arm64 ;;
  *) echo "不支持此系统 / Unsupported system: $os $cpu" >&2; exit 1 ;;
esac
if [ "$native" != "$target" ]; then
  echo "这个包适用于 $target。请使用 $native 包。 / This machine needs the $native package." >&2
  exit 1
fi
if ! ./runtime/bin/node --version >/dev/null; then
  echo "无法启动包内的 Node。请检查系统版本和解压后保留的执行权限。 / Check system requirements and executable permissions." >&2
  exit 1
fi
/bin/sh ./labs/prepare.sh
printf '%s\n' '关闭游戏请在此窗口按 Ctrl+C。 / Press Ctrl+C here to stop the game.'
if [ -f .env ]; then
  exec ./runtime/bin/node --env-file=.env server/index.mjs --production "$@"
fi
exec ./runtime/bin/node server/index.mjs --production "$@"
