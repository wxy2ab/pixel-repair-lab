"""Prepare the optional local classroom demos."""

import hashlib
import json
from pathlib import Path
import struct
import subprocess
import sys
import urllib.request


ROOT = Path(__file__).resolve().parent
ENVIRONMENT = ROOT / '.venv'
CACHE = ROOT / '.cache'
MODEL_INFO = json.loads((ROOT / 'yolox-model.json').read_text(encoding='utf-8'))
MODEL = CACHE / MODEL_INFO['name']


def valid_model(path):
    if not path.is_file() or path.stat().st_size != MODEL_INFO['size']:
        return False
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest() == MODEL_INFO['sha256']


def download_model():
    if valid_model(MODEL):
        return
    print('Downloading the OpenCV Zoo YOLOX model…', flush=True)
    CACHE.mkdir(exist_ok=True)
    temporary = MODEL.with_suffix('.download')
    try:
        with urllib.request.urlopen(MODEL_INFO['url'], timeout=45) as remote, temporary.open('wb') as destination:
            received = 0
            while block := remote.read(256 * 1024):
                received += len(block)
                if received > MODEL_INFO['size']:
                    raise ValueError('YOLOX model is larger than expected')
                destination.write(block)
        if not valid_model(temporary):
            raise ValueError('YOLOX model checksum did not match')
        temporary.replace(MODEL)
    finally:
        temporary.unlink(missing_ok=True)


def can_run(executable, *args):
    try:
        probe = subprocess.run([str(executable), '-I', *args],
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return probe.returncode == 0
    except OSError:
        return False


def main():
    if sys.version_info[:2] not in {(3, 11), (3, 12), (3, 13)} or struct.calcsize('P') != 8:
        raise SystemExit('The classroom demos require 64-bit Python 3.11, 3.12, or 3.13.')
    executable = ENVIRONMENT / ('Scripts/python.exe' if sys.platform == 'win32' else 'bin/python')
    if not ENVIRONMENT.exists() and not ENVIRONMENT.is_symlink():
        import venv
        venv.EnvBuilder(with_pip=True).create(ENVIRONMENT)
    else:
        supported = 'import struct, sys; sys.exit(not ((3, 11) <= sys.version_info[:2] <= (3, 13) and struct.calcsize("P") == 8))'
        # An interrupted setup can leave a working interpreter without pip.
        if not can_run(executable, '-c', supported) or not (
            can_run(executable, '-m', 'pip', '--version') or can_run(executable, '-m', 'ensurepip', '--upgrade')
        ):
            raise SystemExit('请先把 labs/.venv 移到备用位置，再重新初始化实验。 / '
                             'Move the incomplete labs/.venv aside, then run labs setup again.')

    subprocess.run([
        str(executable), '-m', 'pip', 'install', '--disable-pip-version-check',
        '--only-binary=:all:', '-r', str(ROOT / 'requirements.txt'),
    ], check=True)
    subprocess.run([
        str(executable), '-I', '-c', 'import cv2, duckdb, numpy, pandas, sqlite3',
    ], check=True)
    download_model()
    print('Classroom demos are ready. Keep labs/.venv and labs/.cache for offline use.')


if __name__ == '__main__':
    main()
