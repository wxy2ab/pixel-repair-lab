"""Write a Unix distribution archive, including when the build host is Windows."""

import gzip
from pathlib import Path
import sys
import tarfile


def portable_header(entry):
    if not (entry.isdir() or entry.isreg()):
        raise ValueError(f"Unexpected archive member: {entry.name}")
    entry.uid = entry.gid = 0
    entry.uname = entry.gname = ""
    entry.mtime = 0
    executable = entry.name.endswith(("/runtime/bin/node", ".command", ".sh"))
    entry.mode = 0o755 if entry.isdir() or executable else 0o644
    return entry


def main():
    stage, archive = map(Path, sys.argv[1:])
    with archive.open("xb") as output:
        with gzip.GzipFile(filename="", fileobj=output, mode="wb", mtime=0, compresslevel=3) as compressed:
            with tarfile.open(fileobj=compressed, mode="w|") as tar:
                tar.add(stage, arcname=stage.name, filter=portable_header)


if __name__ == "__main__":
    main()
