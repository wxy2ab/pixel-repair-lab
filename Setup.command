#!/bin/sh
# Include the usual Homebrew and Node installer paths when launched from Finder.
export PATH="${PATH:-/usr/bin:/bin}:/opt/homebrew/bin:/usr/local/bin"
exec /bin/sh "$(dirname "$0")/setup.sh" "$@"
